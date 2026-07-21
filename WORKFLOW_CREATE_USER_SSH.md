# Workflow: FreeIPA → локальный пользователь на SSH-хостах

Workflow выполняет одну цепочку:

```text
Создать пользователя FreeIPA
          ↓ только при успехе
Разделить список SSH-хостов
          ↓
Создать локального пользователя на каждом хосте
```

## Что остаётся

Основной `xyops.json` содержит:

- `Управление FreeIPA`;
- `FreeIPA — Создать пользователя`;
- `FreeIPA — Восстановить пользователя`;
- `Кэш каталога FreeIPA`, необходимый для динамических списков.

SSH-часть содержит один Plugin:

```text
SSH — Создать локального пользователя
ID: pmlc2ha8fssh_user
```

## Импорт

Импортируйте в таком порядке:

1. `xyops.json`;
2. `xyops-ssh-plugin.json`;
3. `workflow-create-user-ssh.json`.

## Secret Vault

Для FreeIPA:

```text
IPA_USERNAME
IPA_PASSWORD
```

Для подключения к SSH-хостам:

```text
SSH_USERNAME
SSH_PASSWORD
```

Вместо `SSH_PASSWORD` можно использовать:

```text
SSH_PRIVATE_KEY
SSH_PASSPHRASE
```

Если техническому SSH-пользователю требуется пароль для `sudo`:

```text
SSH_SUDO_PASSWORD
```

Если у технического пользователя настроен `NOPASSWD`, этот секрет не нужен.

## Что вводится при запуске

- URL и CA FreeIPA;
- логин, имя, фамилия и email;
- пароль пользователя;
- группы FreeIPA;
- открытый SSH-ключ;
- sudo / sudo без пароля;
- список `host:port`.

Один логин и один пароль используются на шаге FreeIPA и на шаге создания локальной Linux-учётной записи.

## Скрипт на SSH-хосте

Plugin отправляет файл:

```text
scripts/create-local-user.sh
```

и запускает его через:

```text
sudo bash -s
```

Скрипт:

- создаёт или обновляет локального пользователя;
- создаёт home и `.ssh/authorized_keys`;
- добавляет открытый ключ без дублирования;
- устанавливает пароль;
- выдаёт sudo через `/etc/sudoers.d/90-xyops-<username>`;
- не меняет пароль root;
- не редактирует `sshd_config`;
- не устанавливает пакеты;
- не создаёт локальный дубль пользователя LDAP/SSSD.
