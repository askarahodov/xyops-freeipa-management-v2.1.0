#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Non-interactive local Linux user provisioning for xyOps.
# Required base64 variables are injected by local-user.js before this script:
#   XYOPS_LOCAL_USERNAME_B64
#   XYOPS_LOCAL_PASSWORD_B64
#   XYOPS_LOCAL_PUBLIC_KEY_B64
# Optional controls:
#   XYOPS_LOCAL_GRANT_SUDO=true|false
#   XYOPS_LOCAL_PASSWORDLESS_SUDO=true|false
#   XYOPS_LOCAL_REPLACE_AUTHORIZED_KEYS=true|false

log() {
  printf '[local-user] %s\n' "$*"
}

fail() {
  local code="$1"
  shift
  printf '[local-user] ERROR: %s\n' "$*" >&2
  exit "$code"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail 11 "Required command is missing: $1"
}

normalize_bool() {
  case "${1,,}" in
    1|true|yes|y|on) printf 'true' ;;
    0|false|no|n|off|'') printf 'false' ;;
    *) fail 12 "Invalid boolean value: $1" ;;
  esac
}

decode_required_b64() {
  local name="$1"
  local encoded="${!name:-}"
  [[ -n "$encoded" ]] || fail 13 "Required payload variable is missing: $name"
  printf '%s' "$encoded" | base64 -d 2>/dev/null || fail 14 "Invalid base64 payload: $name"
}

[[ "$(id -u)" -eq 0 ]] || fail 10 "Provisioning script must run as root"

for cmd in awk base64 cat chmod chown chpasswd getent grep groupadd id install mktemp mv rm useradd usermod; do
  require_command "$cmd"
done

USERNAME="$(decode_required_b64 XYOPS_LOCAL_USERNAME_B64)"
USER_PASSWORD="$(decode_required_b64 XYOPS_LOCAL_PASSWORD_B64)"
PUBLIC_KEY="$(decode_required_b64 XYOPS_LOCAL_PUBLIC_KEY_B64)"
GRANT_SUDO="$(normalize_bool "${XYOPS_LOCAL_GRANT_SUDO:-true}")"
PASSWORDLESS_SUDO="$(normalize_bool "${XYOPS_LOCAL_PASSWORDLESS_SUDO:-false}")"
REPLACE_AUTHORIZED_KEYS="$(normalize_bool "${XYOPS_LOCAL_REPLACE_AUTHORIZED_KEYS:-false}")"

# Remove encoded secrets from the environment before invoking child processes.
unset XYOPS_LOCAL_USERNAME_B64 XYOPS_LOCAL_PASSWORD_B64 XYOPS_LOCAL_PUBLIC_KEY_B64
unset XYOPS_LOCAL_GRANT_SUDO XYOPS_LOCAL_PASSWORDLESS_SUDO XYOPS_LOCAL_REPLACE_AUTHORIZED_KEYS

[[ "$USERNAME" =~ ^[a-z_][a-z0-9_.-]{0,31}$ ]] \
  || fail 15 "Invalid username: $USERNAME"
[[ -n "$USER_PASSWORD" ]] || fail 16 "User password must not be empty"
[[ "$USER_PASSWORD" != *$'\n'* && "$USER_PASSWORD" != *$'\r'* ]] \
  || fail 17 "User password must not contain newline characters"
[[ "$PUBLIC_KEY" != *$'\n'* && "$PUBLIC_KEY" != *$'\r'* ]] \
  || fail 18 "SSH public key must be provided on one line"

KEY_TYPE="${PUBLIC_KEY%% *}"
KEY_REST="${PUBLIC_KEY#* }"
KEY_PAYLOAD="${KEY_REST%% *}"

case "$KEY_TYPE" in
  ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|\
  sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com) ;;
  *) fail 19 "Unsupported SSH public key type: $KEY_TYPE" ;;
esac

[[ "$PUBLIC_KEY" == *" "* && -n "$KEY_PAYLOAD" ]] \
  || fail 19 "Malformed SSH public key"
printf '%s' "$KEY_PAYLOAD" | base64 -d >/dev/null 2>&1 \
  || fail 19 "Malformed SSH public key payload"

is_local_user() {
  awk -F: -v user="$USERNAME" '$1 == user { found=1 } END { exit !found }' /etc/passwd
}

if getent passwd "$USERNAME" >/dev/null 2>&1; then
  is_local_user || fail 20 "User '$USERNAME' exists through NSS/LDAP/SSSD but is not local; refusing to create a duplicate"
  USER_ACTION='updated'
  log "Updating existing local user '$USERNAME'"
  usermod -s /bin/bash "$USERNAME"
else
  log "Creating local user '$USERNAME'"
  if ! getent group "$USERNAME" >/dev/null 2>&1; then
    groupadd "$USERNAME"
  fi
  useradd -m -s /bin/bash -g "$USERNAME" "$USERNAME"
  USER_ACTION='created'
fi

PASSWD_ENTRY="$(getent passwd "$USERNAME")"
USER_HOME="$(printf '%s\n' "$PASSWD_ENTRY" | awk -F: '{print $6}')"
USER_GROUP="$(id -gn "$USERNAME")"

[[ -n "$USER_HOME" && "$USER_HOME" == /* ]] || {
  USER_HOME="/home/$USERNAME"
  usermod -d "$USER_HOME" "$USERNAME"
}

[[ ! -L "$USER_HOME" ]] || fail 21 "User home must not be a symbolic link: $USER_HOME"
install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$USER_HOME"

printf '%s:%s\n' "$USERNAME" "$USER_PASSWORD" | chpasswd
unset USER_PASSWORD

SSH_DIR="$USER_HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"
[[ ! -L "$SSH_DIR" ]] || fail 22 "SSH directory must not be a symbolic link: $SSH_DIR"
[[ ! -L "$AUTHORIZED_KEYS" ]] || fail 23 "authorized_keys must not be a symbolic link: $AUTHORIZED_KEYS"

install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$SSH_DIR"
TMP_KEY="$(mktemp "$SSH_DIR/.authorized_keys.xyops.XXXXXX")"
TMP_SUDOERS=''

cleanup() {
  rm -f "$TMP_KEY"
  [[ -z "$TMP_SUDOERS" ]] || rm -f "$TMP_SUDOERS"
}
trap cleanup EXIT

KEY_ACTION='present'
if [[ "$REPLACE_AUTHORIZED_KEYS" == 'true' ]]; then
  printf '%s\n' "$PUBLIC_KEY" > "$TMP_KEY"
  KEY_ACTION='replaced'
else
  if [[ -f "$AUTHORIZED_KEYS" ]]; then
    cat "$AUTHORIZED_KEYS" > "$TMP_KEY"
  fi

  if ! grep -Fqx -- "$PUBLIC_KEY" "$TMP_KEY"; then
    printf '%s\n' "$PUBLIC_KEY" >> "$TMP_KEY"
    KEY_ACTION='appended'
  fi
fi

install -m 0600 -o "$USERNAME" -g "$USER_GROUP" "$TMP_KEY" "$AUTHORIZED_KEYS"
unset PUBLIC_KEY

if command -v restorecon >/dev/null 2>&1; then
  restorecon -RF "$SSH_DIR" >/dev/null 2>&1 || true
fi

SUDOERS_FILE="/etc/sudoers.d/90-xyops-$USERNAME"
SUDO_MODE='disabled'

if [[ "$GRANT_SUDO" == 'true' ]]; then
  require_command sudo
  require_command visudo
  install -d -m 0750 -o root -g root /etc/sudoers.d
  [[ ! -L "$SUDOERS_FILE" ]] || fail 30 "Managed sudoers file must not be a symbolic link: $SUDOERS_FILE"

  if [[ "$PASSWORDLESS_SUDO" == 'true' ]]; then
    SUDO_RULE="$USERNAME ALL=(ALL:ALL) NOPASSWD: ALL"
    SUDO_MODE='passwordless'
  else
    SUDO_RULE="$USERNAME ALL=(ALL:ALL) ALL"
    SUDO_MODE='password'
  fi

  TMP_SUDOERS="$(mktemp "/etc/sudoers.d/.90-xyops-$USERNAME.XXXXXX")"
  printf '%s\n' "$SUDO_RULE" > "$TMP_SUDOERS"
  chmod 0440 "$TMP_SUDOERS"
  chown root:root "$TMP_SUDOERS"
  visudo -cf "$TMP_SUDOERS" >/dev/null
  mv -f "$TMP_SUDOERS" "$SUDOERS_FILE"
  TMP_SUDOERS=''
else
  rm -f "$SUDOERS_FILE"
fi

log "Provisioning completed for '$USERNAME'"
printf 'status=success\n'
printf 'user=%s\n' "$USERNAME"
printf 'action=%s\n' "$USER_ACTION"
printf 'home=%s\n' "$USER_HOME"
printf 'shell=/bin/bash\n'
printf 'authorized_keys=%s\n' "$AUTHORIZED_KEYS"
printf 'authorized_keys_action=%s\n' "$KEY_ACTION"
printf 'sudo=%s\n' "$SUDO_MODE"
