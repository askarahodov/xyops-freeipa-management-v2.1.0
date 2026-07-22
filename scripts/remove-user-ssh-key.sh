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

for command_name in awk base64 getent id rm; do
    require_command "$command_name"
done

USERNAME="$(decode_required XYOPS_USERNAME_B64)"
unset XYOPS_USERNAME_B64

[[ "$USERNAME" =~ ^[a-z_][a-z0-9_.-]{0,31}$ ]] ||
    fail 14 "Недопустимый логин: $USERNAME"

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

[[ -n "$USER_HOME" && "$USER_HOME" == /* ]] ||
    fail 15 "Не удалось определить домашний каталог пользователя $USERNAME"

[[ ! -L "$USER_HOME" ]] ||
    fail 16 "Домашний каталог является символической ссылкой: $USER_HOME"

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
    fail 17 "Каталог $SSH_DIR является символической ссылкой"

if [[ ! -e "$AUTHORIZED_KEYS" ]]; then
    KEY_ACTION='authorized-keys-not-found'
    REMOVED_COUNT=0
    log "Файл $AUTHORIZED_KEYS отсутствует; изменений нет"
    print_result
    exit 0
fi

[[ -f "$AUTHORIZED_KEYS" ]] ||
    fail 18 "Путь $AUTHORIZED_KEYS не является обычным файлом"

[[ ! -L "$AUTHORIZED_KEYS" ]] ||
    fail 19 "Файл $AUTHORIZED_KEYS является символической ссылкой"

REMOVED_COUNT="$(
    awk '
        NF && $1 !~ /^#/ { count++ }
        END { print count + 0 }
    ' "$AUTHORIZED_KEYS"
)"

rm -f -- "$AUTHORIZED_KEYS"

KEY_ACTION='authorized-keys-removed'
log "Файл authorized_keys пользователя $USERNAME удалён; ключей было: $REMOVED_COUNT"
print_result
