# Workflow: FreeIPA → локальный пользователь на SSH-хостах

## Назначение

Workflow выполняет полный сценарий создания пользователя:

```text
Создать пользователя FreeIPA
          ↓ только при успехе
Разделить список SSH-хостов
          ↓
Создать или обновить локального пользователя на каждой ноде
```

Если FreeIPA Job завершается ошибкой, SSH Job не запускаются.

## Импорт

```text
1. xyops.json
2. xyops-ssh-plugin.json
3. workflow-create-user-ssh.json
```

До импорта Workflow должны существовать Plugin ID:

```text
pmlc2ha8fipa_create
pmlc2ha8fssh_user
```

## Secret Vault

FreeIPA:

```text
IPA_USERNAME
IPA_PASSWORD
IPA_CA_CERT_PATH   # необязательно
```

SSH:

```text
SSH_USERNAME
SSH_PASSWORD       # либо SSH_PRIVATE_KEY
SSH_PRIVATE_KEY    # либо SSH_PASSWORD
SSH_PASSPHRASE     # если приватный ключ зашифрован
SSH_SUDO_PASSWORD  # если sudo требует отдельный пароль
```

Необязательно для проверки ключа сервера:

```text
SSH_HOST_FINGERPRINT=SHA256:...
```

Пароль создаваемого пользователя и его публичный ключ вводятся в форме Workflow и не являются секретами технической SSH-учётки.

## Поля запуска

- URL и CA FreeIPA;
- логин, имя, фамилия и email;
- пароль пользователя;
- группы FreeIPA;
- публичный SSH-ключ пользователя;
- sudo и режим NOPASSWD;
- SSH-хосты по одному `host:port` на строку.

Один логин и один пароль используются в FreeIPA и в локальной Linux-учётной записи.

## Результат на SSH-хосте

На каждой ноде:

- создаётся или обновляется локальный пользователь;
- устанавливается пароль;
- создаются home и `.ssh/authorized_keys`;
- добавляется публичный ключ без дублирования;
- создаётся `/etc/sudoers.d/90-xyops-<username>`, если sudo разрешён.

Не изменяются:

- пароль root;
- глобальный `sshd_config`;
- пакетный менеджер и установленные пакеты.

Если пользователь найден только через LDAP/SSSD и отсутствует в `/etc/passwd`, локальный дубль не создаётся.

## Выполнение скрипта

xySat читает:

```text
scripts/create-local-user.sh
```

и передаёт его через SSH в STDIN:

```bash
sudo bash -s
```

Файл скрипта на удалённой ноде постоянно не хранится.
