#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

log() {
    printf '[xyops-user] %s\n' "$*"
}

fail() {
    local code="$1"
    shift
    printf '[xyops-user] ERROR: %s\n' "$*" >&2
    exit "$code"
}

decode_required() {
    local name="$1"
    local value="${!name:-}"

    [[ -n "$value" ]] || fail 10 "Не передана переменная $name"
    printf '%s' "$value" | base64 -d 2>/dev/null ||
        fail 11 "Некорректное base64-значение в $name"
}

as_bool() {
    case "${1,,}" in
        1|true|yes|on) printf 'true' ;;
        0|false|no|off|'') printf 'false' ;;
        *) fail 12 "Некорректное логическое значение: $1" ;;
    esac
}

require_command() {
    command -v "$1" >/dev/null 2>&1 ||
        fail 13 "На хосте отсутствует команда: $1"
}

[[ "$(id -u)" -eq 0 ]] ||
    fail 14 "Скрипт должен выполняться от root"

for command_name in \
    awk base64 cat chmod chown chpasswd getent grep id \
    install mktemp mv rm useradd usermod
do
    require_command "$command_name"
done

USERNAME="$(decode_required XYOPS_USERNAME_B64)"
USER_PASSWORD="$(decode_required XYOPS_PASSWORD_B64)"
PUBLIC_KEY="$(decode_required XYOPS_PUBLIC_KEY_B64)"
GRANT_SUDO="$(as_bool "${XYOPS_GRANT_SUDO:-true}")"
PASSWORDLESS_SUDO="$(as_bool "${XYOPS_PASSWORDLESS_SUDO:-false}")"

unset \
    XYOPS_USERNAME_B64 \
    XYOPS_PASSWORD_B64 \
    XYOPS_PUBLIC_KEY_B64 \
    XYOPS_GRANT_SUDO \
    XYOPS_PASSWORDLESS_SUDO

[[ "$USERNAME" =~ ^[a-z_][a-z0-9_.-]{0,31}$ ]] ||
    fail 15 "Недопустимый логин: $USERNAME"

[[ -n "$USER_PASSWORD" ]] ||
    fail 16 "Пароль пользователя пустой"

[[ "$USER_PASSWORD" != *$'\n'* && "$USER_PASSWORD" != *$'\r'* ]] ||
    fail 17 "Пароль не должен содержать перевод строки"

[[ "$PUBLIC_KEY" != *$'\n'* && "$PUBLIC_KEY" != *$'\r'* ]] ||
    fail 18 "Публичный ключ должен быть одной строкой"

KEY_TYPE="${PUBLIC_KEY%% *}"
KEY_REST="${PUBLIC_KEY#* }"
KEY_DATA="${KEY_REST%% *}"

case "$KEY_TYPE" in
    ssh-ed25519|ssh-rsa|\
    ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|\
    sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)
        ;;
    *)
        fail 19 "Неподдерживаемый тип SSH-ключа: $KEY_TYPE"
        ;;
esac

[[ -n "$KEY_DATA" ]] ||
    fail 19 "Некорректный публичный SSH-ключ"

printf '%s' "$KEY_DATA" | base64 -d >/dev/null 2>&1 ||
    fail 19 "Повреждена base64-часть публичного SSH-ключа"

if grep -qE "^${USERNAME}:" /etc/passwd; then
    USER_ACTION='updated'
    log "Обновляю локального пользователя $USERNAME"
    usermod --shell /bin/bash "$USERNAME"
elif getent passwd "$USERNAME" >/dev/null 2>&1; then
    fail 20 \
        "Пользователь $USERNAME уже существует через LDAP/SSSD. Локальный дубль не создаётся"
else
    USER_ACTION='created'
    log "Создаю локального пользователя $USERNAME"
    useradd --create-home --shell /bin/bash "$USERNAME"
fi

PASSWD_ENTRY="$(getent passwd "$USERNAME")"
USER_HOME="$(printf '%s\n' "$PASSWD_ENTRY" | awk -F: '{print $6}')"
USER_GROUP="$(id -gn "$USERNAME")"

if [[ -z "$USER_HOME" || "$USER_HOME" != /* ]]; then
    USER_HOME="/home/$USERNAME"
    usermod --home "$USER_HOME" "$USERNAME"
fi

[[ ! -L "$USER_HOME" ]] ||
    fail 21 "Домашний каталог является символической ссылкой: $USER_HOME"

install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$USER_HOME"

printf '%s:%s\n' "$USERNAME" "$USER_PASSWORD" | chpasswd
unset USER_PASSWORD

SSH_DIR="$USER_HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"

[[ ! -L "$SSH_DIR" ]] ||
    fail 22 "Каталог $SSH_DIR является символической ссылкой"

[[ ! -L "$AUTHORIZED_KEYS" ]] ||
    fail 23 "Файл $AUTHORIZED_KEYS является символической ссылкой"

install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$SSH_DIR"

TMP_KEYS="$(mktemp "$SSH_DIR/.authorized_keys.xyops.XXXXXX")"
TMP_SUDOERS=''

cleanup() {
    rm -f "$TMP_KEYS"
    [[ -z "$TMP_SUDOERS" ]] || rm -f "$TMP_SUDOERS"
}
trap cleanup EXIT

if [[ -f "$AUTHORIZED_KEYS" ]]; then
    cat "$AUTHORIZED_KEYS" > "$TMP_KEYS"
fi

if grep -Fqx -- "$PUBLIC_KEY" "$TMP_KEYS"; then
    KEY_ACTION='already-present'
else
    printf '%s\n' "$PUBLIC_KEY" >> "$TMP_KEYS"
    KEY_ACTION='appended'
fi

install \
    -m 0600 \
    -o "$USERNAME" \
    -g "$USER_GROUP" \
    "$TMP_KEYS" \
    "$AUTHORIZED_KEYS"

unset PUBLIC_KEY

if command -v restorecon >/dev/null 2>&1; then
    restorecon -RF "$SSH_DIR" >/dev/null 2>&1 || true
fi

SUDOERS_FILE="/etc/sudoers.d/90-xyops-$USERNAME"
SUDO_MODE='disabled'
ADMIN_GROUP=''

if [[ "$GRANT_SUDO" == 'true' ]]; then
    require_command sudo
    require_command visudo

    if getent group sudo >/dev/null 2>&1; then
        ADMIN_GROUP='sudo'
        usermod -aG "$ADMIN_GROUP" "$USERNAME"
    elif getent group wheel >/dev/null 2>&1; then
        ADMIN_GROUP='wheel'
        usermod -aG "$ADMIN_GROUP" "$USERNAME"
    fi

    install -d -m 0750 -o root -g root /etc/sudoers.d

    [[ ! -L "$SUDOERS_FILE" ]] ||
        fail 30 "Файл $SUDOERS_FILE является символической ссылкой"

    if [[ "$PASSWORDLESS_SUDO" == 'true' ]]; then
        SUDO_RULE="$USERNAME ALL=(ALL) NOPASSWD: ALL"
        SUDO_MODE='passwordless'
    else
        SUDO_RULE="$USERNAME ALL=(ALL) ALL"
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

log "Пользователь $USERNAME успешно настроен"

printf 'status=success\n'
printf 'user=%s\n' "$USERNAME"
printf 'action=%s\n' "$USER_ACTION"
printf 'home=%s\n' "$USER_HOME"
printf 'authorized_keys=%s\n' "$AUTHORIZED_KEYS"
printf 'authorized_keys_action=%s\n' "$KEY_ACTION"
printf 'sudo=%s\n' "$SUDO_MODE"
[[ -z "$ADMIN_GROUP" ]] || printf 'admin_group=%s\n' "$ADMIN_GROUP"
