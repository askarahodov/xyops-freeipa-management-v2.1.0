# Workflow: отключение FreeIPA-пользователя и удаление SSH-ключей

## Назначение

Workflow выполняет действия последовательно:

```text
Отключить пользователя FreeIPA
          ↓ только при успехе
Split списка SSH-хостов
          ↓
Удалить authorized_keys локального пользователя
```

Если отключение FreeIPA завершается ошибкой, SSH Job не запускаются.

## Импорт

```text
1. xyops.json
2. xyops-ssh-plugin.json
3. workflow-disable-user-ssh-key.json
```

Необходимые Plugin ID:

```text
pmlc2ha8fipa1
pmlc2ha8fssh_key_remove
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

Необязательно:

```text
SSH_HOST_FINGERPRINT=SHA256:...
```

## Поля запуска

- URL и CA-сертификат FreeIPA;
- логин пользователя;
- SSH-хосты по одному `host:port` на строку.

Публичный ключ указывать не нужно.

## Что происходит на ноде

Удаляется весь файл:

```text
/home/<username>/.ssh/authorized_keys
```

Сохраняются:

- локальный пользователь;
- пароль;
- home;
- sudo-права;
- каталог `.ssh`.

Если пользователя, `.ssh` или `authorized_keys` нет, SSH-шаг завершается успешно без изменений.

## Ограничения

Удаление `authorized_keys`:

- не завершает уже открытые SSH-сессии;
- не запрещает вход по паролю;
- не блокирует локального пользователя;
- не удаляет sudo-права.

Для полной локальной блокировки нужен отдельный сценарий блокировки пароля/учётной записи и завершения активных сессий.
