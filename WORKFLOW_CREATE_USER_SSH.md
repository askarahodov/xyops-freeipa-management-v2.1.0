# Workflow: создание пользователя FreeIPA и SSH Hello World

## Почему импорт разделён на два файла

xyOps проверяет ссылки на плагины в Workflow во время создания Event. Новый Plugin из того же XYPDF в этот момент ещё не находится в установленном каталоге. Поэтому импорт выполняется строго по порядку.

## Импорт

### 1. SSH Event Plugin

Импортируйте:

```text
xyops-ssh-plugin.json
```

После импорта убедитесь, что появился Plugin:

```text
SSH — Выполнить команду
ID: pmlc2ha8fssh1
```

### 2. Workflow

Только после установки SSH Plugin импортируйте:

```text
workflow-create-user-ssh.json
```

Должен появиться Event:

```text
Создать пользователя FreeIPA → SSH Hello World
```

До импорта Workflow также должен существовать Plugin:

```text
FreeIPA — Создать пользователя
ID: pmlc2ha8fipa_create
```

Он устанавливается основным файлом `xyops.json`.

## Secret Vault

Назначьте секреты плагинам или родительскому Workflow:

```text
IPA_USERNAME
IPA_PASSWORD

SSH_USERNAME
SSH_PASSWORD
```

Вместо `SSH_PASSWORD` можно использовать:

```text
SSH_PRIVATE_KEY
SSH_PASSPHRASE
```

## Запуск

В поле `SSH-адреса и порты` укажите по одному адресу на строку:

```text
192.168.1.10:22
192.168.1.11:2222
server.example.local:22
[2001:db8::10]:22
```

После успешного создания пользователя Split Controller запустит отдельный SSH Job для каждого адреса и выполнит:

```bash
printf 'Hello World\n'
```
