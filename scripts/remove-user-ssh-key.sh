#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

log() {
    printf '[xyops-key-remove] %s\n' "$*"
}

fail() {
    local code="$1"
    shift
    printf '[xyops-key-remove] ERROR: %s\n' "$*" >&2
    exit "$code"
}

decode_required() {
    local name="$1"
    local value="${!name:-}"

    [[ -n "$value" ]] || fail 10 "Не передана переменная $name"
    printf '%s' "$value" | base64 -d 2>/dev/null ||
        fail 11 "Некорректное base64-значение в $name"
}

require_command() {
    command -v "$1" >/dev/null 2>&1 ||
        fail 12 "На хосте отсутствует команда: $1"
}

print_result() {
    printf 'status=success\n'
    printf 'user=%s\n' "$USERNAME"
    printf 'authorized_keys=%s\n' "${AUTHORIZED_KEYS:-}"
    printf 'key_action=%s\n' "$KEY_ACTION"
    printf 'removed_count=%s\n' "${REMOVED_COUNT:-0}"
}

[[ "$(id -u)" -eq 0 ]] ||
    fail 13 "Скрипт должен выполняться от root"

for command_name in awk base64 getent id install mktemp mv rm; do
    require_command "$command_name"
done

USERNAME="$(decode_required XYOPS_USERNAME_B64)"
PUBLIC_KEY="$(decode_required XYOPS_PUBLIC_KEY_B64)"

unset XYOPS_USERNAME_B64 XYOPS_PUBLIC_KEY_B64

[[ "$USERNAME" =~ ^[a-z_][a-z0-9_.-]{0,31}$ ]] ||
    fail 14 "Недопустимый логин: $USERNAME"

[[ "$PUBLIC_KEY" != *$'\n'* && "$PUBLIC_KEY" != *$'\r'* ]] ||
    fail 15 "Публичный ключ должен быть одной строкой"

KEY_TYPE="${PUBLIC_KEY%% *}"
KEY_REST="${PUBLIC_KEY#* }"
KEY_DATA="${KEY_REST%% *}"

case "$KEY_TYPE" in
    ssh-ed25519|ssh-rsa|\
    ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|\
    sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)
        ;;
    *)
        fail 16 "Неподдерживаемый тип SSH-ключа: $KEY_TYPE"
        ;;
esac

[[ -n "$KEY_DATA" ]] ||
    fail 16 "Некорректный публичный SSH-ключ"

printf '%s' "$KEY_DATA" | base64 -d >/dev/null 2>&1 ||
    fail 16 "Повреждена base64-часть публичного SSH-ключа"

if ! awk -F: -v user="$USERNAME" '
    $1 == user { found = 1 }
    END { exit !found }
' /etc/passwd; then
    KEY_ACTION='local-user-not-found'
    REMOVED_COUNT=0
    log "Локальный пользователь $USERNAME отсутствует; изменений нет"
    print_result
    exit 0
fi

PASSWD_ENTRY="$(getent passwd "$USERNAME")"
USER_HOME="$(printf '%s\n' "$PASSWD_ENTRY" | awk -F: '{print $6}')"
USER_GROUP="$(id -gn "$USERNAME")"

[[ -n "$USER_HOME" && "$USER_HOME" == /* ]] ||
    fail 17 "Не удалось определить домашний каталог пользователя $USERNAME"

[[ ! -L "$USER_HOME" ]] ||
    fail 18 "Домашний каталог является символической ссылкой: $USER_HOME"

SSH_DIR="$USER_HOME/.ssh"
AUTHORIZED_KEYS="$SSH_DIR/authorized_keys"

if [[ ! -d "$SSH_DIR" ]]; then
    KEY_ACTION='ssh-directory-not-found'
    REMOVED_COUNT=0
    log "Каталог $SSH_DIR отсутствует; изменений нет"
    print_result
    exit 0
fi

[[ ! -L "$SSH_DIR" ]] ||
    fail 19 "Каталог $SSH_DIR является символической ссылкой"

if [[ ! -f "$AUTHORIZED_KEYS" ]]; then
    KEY_ACTION='authorized-keys-not-found'
    REMOVED_COUNT=0
    log "Файл $AUTHORIZED_KEYS отсутствует; изменений нет"
    print_result
    exit 0
fi

[[ ! -L "$AUTHORIZED_KEYS" ]] ||
    fail 20 "Файл $AUTHORIZED_KEYS является символической ссылкой"

REMOVED_COUNT="$(
    awk -v key_type="$KEY_TYPE" -v key_data="$KEY_DATA" '
        {
            for (i = 1; i < NF; i++) {
                if ($i == key_type && $(i + 1) == key_data) {
                    count++
                    break
                }
            }
        }
        END { print count + 0 }
    ' "$AUTHORIZED_KEYS"
)"

if [[ "$REMOVED_COUNT" -eq 0 ]]; then
    KEY_ACTION='key-not-found'
    log "Указанный ключ пользователя $USERNAME уже отсутствует"
    print_result
    exit 0
fi

TMP_KEYS="$(mktemp "$SSH_DIR/.authorized_keys.xyops.XXXXXX")"

cleanup() {
    rm -f "$TMP_KEYS"
}
trap cleanup EXIT

awk -v key_type="$KEY_TYPE" -v key_data="$KEY_DATA" '
    {
        remove_line = 0
        for (i = 1; i < NF; i++) {
            if ($i == key_type && $(i + 1) == key_data) {
                remove_line = 1
                break
            }
        }
        if (!remove_line) print
    }
' "$AUTHORIZED_KEYS" > "$TMP_KEYS"

install \
    -m 0600 \
    -o "$USERNAME" \
    -g "$USER_GROUP" \
    "$TMP_KEYS" \
    "$AUTHORIZED_KEYS"

if command -v restorecon >/dev/null 2>&1; then
    restorecon -F "$AUTHORIZED_KEYS" >/dev/null 2>&1 || true
fi

KEY_ACTION='removed'
log "Удалено ключей пользователя $USERNAME: $REMOVED_COUNT"
print_result
