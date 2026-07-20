# Workflow: создание пользователя FreeIPA и развёртывание на SSH-хостах

Workflow создаёт пользователя в FreeIPA, а затем на каждом указанном SSH-хосте создаёт или обновляет одноимённую **локальную Linux-учётную запись**.

На хосте выполняется:

- создание пользователя с `/bin/bash`;
- создание домашнего каталога;
- установка того же пароля, который был указан для FreeIPA;
- запись открытого ключа в `~/.ssh/authorized_keys`;
- добавление в `sudo` или `wheel`;
- создание отдельного правила `/etc/sudoers.d/90-xyops-<username>`;
- проверка правила через `visudo`, если команда доступна.

Workflow не меняет пароль `root`, не редактирует глобальный `sshd_config` и не устанавливает пакеты.

## Важное ограничение

Если хост уже подключён к FreeIPA/SSSD и `getent passwd <username>` возвращает удалённого FreeIPA-пользователя, скрипт **не создаёт локальный дубликат** и завершает job ошибкой. Для таких хостов правильнее использовать SSSD, `oddjob-mkhomedir` и централизованный SSH-key provider.

## Порядок импорта

1. Импортируйте основной файл:

```text
xyops.json
```

2. Импортируйте или повторно импортируйте:

```text
xyops-ssh-plugin.json
```

После этого должны существовать два плагина:

```text
SSH — Выполнить команду
ID: pmlc2ha8fssh1

SSH — Создать локального пользователя
ID: pmlc2ha8fssh_user
```

3. Импортируйте или замените workflow:

```text
workflow-create-user-ssh.json
```

Event:

```text
Создать пользователя FreeIPA → развернуть на SSH-хостах
```

## Secret Vault

Для FreeIPA:

```text
IPA_USERNAME
IPA_PASSWORD
```

Для подключения к SSH-хостам:

```text
SSH_USERNAME
SSH_PRIVATE_KEY
SSH_PASSPHRASE
```

Либо вместо ключа:

```text
SSH_USERNAME
SSH_PASSWORD
```

Для выполнения административного скрипта:

```text
SSH_SUDO_PASSWORD
```

`SSH_SUDO_PASSWORD` необязателен в двух случаях:

- SSH-пользователь подключается как `root`;
- SSH-пользователь имеет `NOPASSWD` sudo.

Если `SSH_SUDO_PASSWORD` не задан, плагин пробует использовать `SSH_PASSWORD`.

## Что заполнить при запуске

- URL FreeIPA;
- логин, имя и фамилию;
- пароль пользователя FreeIPA и Linux;
- группы FreeIPA;
- открытый SSH-ключ нового пользователя;
- разрешить ли sudo;
- нужен ли sudo без пароля;
- список `host:port`, по одному адресу на строку.

Пример открытого ключа:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@workstation
```

Пример хостов:

```text
192.168.32.15:5035
192.168.32.15:5037
server.example.local:22
```

## Как работает sudo нового пользователя

При выключенном параметре **Sudo без пароля** пользователь выполняет:

```bash
sudo su -
```

и вводит тот же пароль, который был указан в поле **Пароль пользователя FreeIPA и Linux**.

При включённом параметре **Sudo без пароля** создаётся правило:

```text
username ALL=(ALL:ALL) NOPASSWD: ALL
```

## Что увидите в результате

Output Data содержит только безопасные служебные значения:

```text
ssh_host
ssh_port
provisioned_user
provisioned_user_sudo
ssh_exit_code
ssh_stdout
ssh_stderr
```

Пароль и открытый ключ в Output Data не возвращаются.
