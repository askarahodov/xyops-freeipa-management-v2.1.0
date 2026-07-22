# xyOps FreeIPA & SSH User Management

Набор Event Plugins и готовых Workflow для управления пользователями FreeIPA и локальными Linux-пользователями на SSH-хостах.

Текущая версия: `2.9.0`.

## Возможности

Репозиторий поддерживает четыре основных сценария:

1. управление пользователями и группами FreeIPA;
2. создание пользователя FreeIPA с последующим созданием одноимённого локального пользователя на SSH-хостах;
3. независимое создание локального SSH-пользователя без FreeIPA;
4. отключение пользователя FreeIPA с удалением всех его публичных SSH-ключей на нодах.

## Состав репозитория

### FreeIPA

Файл `xyops.json` импортирует:

| Элемент | Назначение |
|---|---|
| `Кэш каталога FreeIPA` | Storage Bucket `bfreeipacache` для списков пользователей, preserved-пользователей и групп |
| `Управление FreeIPA` | Просмотр и изменение существующих пользователей и групп, а также синхронизация кэша |
| `FreeIPA — Создать пользователя` | Отдельная форма создания пользователя FreeIPA |
| `FreeIPA — Восстановить пользователя` | Восстановление preserved-записи пользователя |

### SSH

Файл `xyops-ssh-plugin.json` импортирует:

| Event Plugin | Назначение |
|---|---|
| `SSH — Создать локального пользователя` | Создаёт или обновляет локального Linux-пользователя, пароль, home, `authorized_keys` и sudo |
| `SSH — Удалить все публичные ключи пользователя` | Удаляет весь файл `~/.ssh/authorized_keys`, не удаляя локальную учётную запись |

### Готовые Workflow

| Файл | Event после импорта | Что делает |
|---|---|---|
| `workflow-create-user-ssh.json` | `Создать пользователя FreeIPA → развернуть на SSH-хостах` | FreeIPA → только при успехе → создание локального пользователя на всех нодах |
| `workflow-disable-user-ssh-key.json` | `Отключить пользователя FreeIPA → удалить все SSH-ключи на хостах` | Отключение FreeIPA → только при успехе → удаление `authorized_keys` |
| `workflow-local-user-ssh.json` | `Создать локального SSH-пользователя на хостах` | Создание локального пользователя на нодах без FreeIPA |

## Требования

На xySat:

- xyOps / xySat `1.0.83` или новее;
- Node.js 18+;
- `npm`, `npx` и `git`;
- сетевой доступ к FreeIPA и SSH-хостам.

На SSH-хостах:

- `bash`;
- `sudo` и `visudo`;
- `useradd`, `usermod`, `chpasswd`;
- технический SSH-пользователь с правом выполнить `sudo bash -s`.

FreeIPA должен быть доступен по HTTPS. Рекомендуется использовать CA-сертификат, например `/etc/ipa/ca.crt`.

## Secret Vault

Секреты относятся к техническим учётным записям автоматизации. Пароль и публичный ключ создаваемого пользователя вводятся в форме Event/Workflow и не являются SSH-секретами.

### FreeIPA-секреты

Обязательные:

```text
IPA_USERNAME=xyops-provisioner
IPA_PASSWORD=<пароль сервисной учётной записи FreeIPA>
```

Необязательный:

```text
IPA_CA_CERT_PATH=/etc/ipa/ca.crt
```

`IPA_CA_CERT_PATH` используется, если поле **Сертификат CA FreeIPA** оставлено пустым.

Рекомендуется использовать отдельную делегированную сервисную учётную запись с минимально необходимыми правами, а не встроенного `admin`.

### SSH-секреты

Всегда нужен технический пользователь:

```text
SSH_USERNAME=xyops-automation
```

Далее настройте один способ аутентификации.

#### Вход по паролю

```text
SSH_PASSWORD=<пароль технического SSH-пользователя>
```

#### Вход по приватному ключу

```text
SSH_PRIVATE_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

Если ключ зашифрован:

```text
SSH_PASSPHRASE=<пароль приватного ключа>
```

#### Пароль для sudo

Если технический SSH-пользователь входит по ключу, но `sudo` запрашивает пароль:

```text
SSH_SUDO_PASSWORD=<пароль технического SSH-пользователя>
```

Если вход выполняется через `SSH_PASSWORD` и пароль sudo совпадает, отдельный `SSH_SUDO_PASSWORD` можно не задавать: плагин использует `SSH_PASSWORD`.

Если технический пользователь имеет разрешение `NOPASSWD` для запуска `bash`, пароль sudo не нужен.

Пример минимального sudo-правила для сервисной учётной записи:

```sudoers
xyops-automation ALL=(root) NOPASSWD: /usr/bin/bash
```

Фактический путь к `bash` проверьте командой:

```bash
command -v bash
```

### Проверка SSH host key

Необязательный секрет:

```text
SSH_HOST_FINGERPRINT=SHA256:...
```

Он содержит отпечаток ключа SSH-сервера, а не ключ пользователя.

Получить отпечаток для порта 22:

```bash
ssh-keyscan -t ed25519 server.example.local 2>/dev/null |
  ssh-keygen -lf - -E sha256
```

Для нестандартного порта:

```bash
ssh-keyscan -t ed25519 -p 2222 server.example.local 2>/dev/null |
  ssh-keygen -lf - -E sha256
```

Если `SSH_HOST_FINGERPRINT` задан в Secret Vault, он применяется ко всем SSH Job, где fingerprint не указан в параметрах. Не используйте один глобальный fingerprint для списка серверов с разными host key.

## Какие секреты нужны каждому сценарию

| Event / Workflow | FreeIPA-секреты | SSH-секреты |
|---|---:|---:|
| `Управление FreeIPA` | Да | Нет |
| `FreeIPA — Создать пользователя` | Да | Нет |
| `FreeIPA — Восстановить пользователя` | Да | Нет |
| `SSH — Создать локального пользователя` | Нет | Да |
| `SSH — Удалить все публичные ключи пользователя` | Нет | Да |
| FreeIPA → создать пользователя на SSH-хостах | Да | Да |
| Отключить FreeIPA → удалить SSH-ключи | Да | Да |
| Создать локального пользователя без FreeIPA | Нет | Да |

## Порядок импорта

### Полная установка

Импортируйте строго в таком порядке:

```text
1. xyops.json
2. xyops-ssh-plugin.json
3. workflow-create-user-ssh.json
4. workflow-disable-user-ssh-key.json
5. workflow-local-user-ssh.json
```

xyOps проверяет Plugin ID во время импорта Workflow. Поэтому `xyops-ssh-plugin.json` должен быть установлен до SSH-workflow.

Ошибка неправильного порядка:

```text
Unknown Plugin ID: pmlc2ha8fssh_user
```

или:

```text
Unknown Plugin ID: pmlc2ha8fssh_key_remove
```

После обновления файлов выбирайте замену существующих элементов.

## Описание Events

### Управление FreeIPA

Поддерживает:

- список и поиск пользователей;
- просмотр пользователя;
- удаление с сохранением preserved-записи или без неё;
- отключение, включение и разблокировку;
- список групп;
- добавление и удаление пользователя из групп;
- синхронизацию кэша для динамических меню.

Поля **Пользователь** и **Группы** загружаются из Storage Bucket `bfreeipacache`.

### FreeIPA — Создать пользователя

Создаёт пользователя только в FreeIPA. Локальный Linux-пользователь на нодах не создаётся.

Поля:

- логин;
- имя и фамилия;
- email;
- начальный пароль;
- группы FreeIPA.

### FreeIPA — Восстановить пользователя

Восстанавливает preserved-запись ранее удалённого пользователя. Выбор загружается из `bfreeipacache/preserved_users`.

### SSH — Создать локального пользователя

На удалённом хосте:

- создаёт или обновляет локального пользователя;
- устанавливает `/bin/bash`;
- задаёт пароль;
- создаёт home;
- создаёт `.ssh/authorized_keys`;
- добавляет публичный ключ без дублирования;
- создаёт управляемое sudo-правило `/etc/sudoers.d/90-xyops-<username>`.

Не изменяет пароль root и глобальный `sshd_config`.

Если имя уже существует только через LDAP/SSSD/NSS и отсутствует в `/etc/passwd`, локальный дубль не создаётся.

### SSH — Удалить все публичные ключи пользователя

Удаляет:

```text
/home/<username>/.ssh/authorized_keys
```

Не удаляет:

- локального пользователя;
- пароль;
- home;
- sudo-права;
- каталог `.ssh`.

Операция не завершает уже открытые SSH-сессии и не запрещает вход по паролю, если `PasswordAuthentication` разрешён на сервере.

## Workflow: FreeIPA → SSH

```text
Создать пользователя FreeIPA
          ↓ только при успехе
Split списка SSH-хостов
          ↓
Создать локального пользователя на каждой ноде
```

Один логин и пароль используются для FreeIPA и локальной Linux-учётной записи.

Если создание FreeIPA завершается ошибкой, SSH Job не запускаются.

Подробности: `WORKFLOW_CREATE_USER_SSH.md`.

## Workflow: отключение FreeIPA → удаление SSH-ключей

```text
Отключить пользователя FreeIPA
          ↓ только при успехе
Split списка SSH-хостов
          ↓
Удалить authorized_keys локального пользователя
```

Публичный ключ указывать не требуется: удаляется весь файл `authorized_keys`.

Подробности: `WORKFLOW_DISABLE_USER_SSH_KEY.md`.

## Workflow: локальный SSH-пользователь без FreeIPA

```text
Manual Trigger
      ↓
Split списка SSH-хостов
      ↓
Создать локального пользователя
```

FreeIPA не вызывается и FreeIPA-секреты не нужны.

Подробности: `WORKFLOW_LOCAL_USER.md`.

## Первичная синхронизация кэша FreeIPA

Создайте Event:

```text
Plugin: Управление FreeIPA
Operation: Синхронизировать меню
List limit: 10000
Target: xySat с доступом к FreeIPA
```

Добавьте действие:

```text
Condition: On Success
Action: Store Bucket
Bucket: Кэш каталога FreeIPA
Sync: Data
```

После выполнения bucket содержит:

```text
users
enabled_users
disabled_users
preserved_users
groups
metadata
```

Рекомендуется обновлять кэш по расписанию и после операций, изменяющих пользователей или группы.

## Как SSH-скрипты выполняются на нодах

Файлы:

```text
scripts/create-local-user.sh
scripts/remove-user-ssh-key.sh
```

не копируются на постоянное хранение.

`npx` загружает репозиторий на xySat, Node.js читает нужный скрипт и отправляет его содержимое через SSH в STDIN команды:

```bash
sudo bash -s
```

После завершения на ноде остаются только результаты операции.

## Диагностика

### Unknown Plugin ID

Сначала импортируйте `xyops-ssh-plugin.json`, затем соответствующий Workflow.

### SSH account cannot run sudo

Настройте `SSH_SUDO_PASSWORD` либо разрешите техническому пользователю требуемый `NOPASSWD sudo`.

### Host key verification failed

Проверьте фактический fingerprint сервера и значение `SSH_HOST_FINGERPRINT` или поля fingerprint в Plugin.

### Ошибка TLS FreeIPA

Проверьте:

- URL FreeIPA;
- путь к CA;
- доступность файла CA на xySat;
- корректность `IPA_USERNAME` и `IPA_PASSWORD`.

Не включайте `insecure_tls` постоянно в production.

## Обновление адреса репозитория

```bash
./configure-repository.sh <owner> [repository] [ref]
```

Пример:

```bash
./configure-repository.sh askarahodov xyops-freeipa-management-v2.1.0 main
```

Скрипт обновляет команды запуска FreeIPA-плагинов внутри `xyops.json`. После смены репозитория проверьте также `xyops-ssh-plugin.json`.

## Проверка проекта

```bash
npm test
npm run check
npm pack --dry-run
```

## Безопасность

- храните технические пароли и приватные ключи только в Secret Vault;
- не вставляйте приватный ключ создаваемого пользователя — нужен только публичный ключ;
- не отключайте проверку TLS FreeIPA в production;
- ограничьте право запуска административных Events и Workflow;
- выдавайте сервисным учётным записям минимально необходимые права;
- помните, что удаление `authorized_keys` не блокирует парольный SSH-доступ и не завершает активные сессии;
- FreeIPA остаётся источником истины, а Storage Bucket является только кэшем.
