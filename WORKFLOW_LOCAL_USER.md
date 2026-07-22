# Workflow: локальный SSH-пользователь без FreeIPA

## Назначение

Workflow создаёт или обновляет локального Linux-пользователя на нескольких SSH-хостах без обращения к FreeIPA.

```text
Manual Trigger
      ↓
Split списка SSH-хостов
      ↓
SSH — Создать локального пользователя
```

## Импорт

```text
1. xyops-ssh-plugin.json
2. workflow-local-user-ssh.json
```

Перед импортом Workflow должен существовать Plugin:

```text
SSH — Создать локального пользователя
ID: pmlc2ha8fssh_user
```

## Secret Vault

Обязательно:

```text
SSH_USERNAME
```

Один способ входа:

```text
SSH_PASSWORD
```

или:

```text
SSH_PRIVATE_KEY
SSH_PASSPHRASE   # если ключ зашифрован
```

Если sudo требует пароль:

```text
SSH_SUDO_PASSWORD
```

Необязательно:

```text
SSH_HOST_FINGERPRINT=SHA256:...
```

FreeIPA-секреты для этого Workflow не нужны.

Пароль и публичный ключ создаваемого пользователя вводятся в форме Workflow.

## Поля запуска

- логин пользователя;
- пароль пользователя;
- публичный SSH-ключ;
- разрешение sudo;
- sudo без пароля;
- SSH-хосты по одному `host:port` на строку.

## Результат

На каждой ноде:

- создаётся или обновляется локальный пользователь;
- устанавливается `/bin/bash`;
- задаётся пароль;
- создаются home и `~/.ssh/authorized_keys`;
- добавляется публичный ключ без дублирования;
- при необходимости создаётся sudo-правило.

Workflow не создаёт пользователя FreeIPA, не меняет пароль root и не редактирует глобальный `sshd_config`.
