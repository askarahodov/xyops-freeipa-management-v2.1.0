# Workflow: создание пользователя FreeIPA и SSH Hello World

Файл импорта: `workflow-create-user-ssh.json`.

## Схема

```text
Manual Trigger
      ↓
Создать пользователя FreeIPA
      ↓ On Success
Split workflow.params.ssh_hosts
      ↓ один job на каждый host:port
SSH: printf 'Hello World\n'
```

SSH jobs не запускаются, если создание пользователя завершилось ошибкой.

## Импорт

1. Сначала импортируйте основной `xyops.json` и убедитесь, что существует плагин `FreeIPA — Создать пользователя`.
2. Импортируйте `workflow-create-user-ssh.json`.
3. Подтвердите создание:
   - плагина `SSH — Выполнить команду`;
   - workflow `Создать пользователя FreeIPA → SSH Hello World`.
4. Убедитесь, что target с ID `main` существует и имеет доступ к FreeIPA и SSH-серверам.

## Secret Vault

Назначьте workflow/узлам или соответствующим плагинам Secret Vault со значениями:

```text
IPA_USERNAME
IPA_PASSWORD
SSH_USERNAME
```

Для SSH добавьте один из вариантов:

```text
SSH_PASSWORD
```

или:

```text
SSH_PRIVATE_KEY
SSH_PASSPHRASE   # только если ключ защищён паролем
```

`SSH_PRIVATE_KEY` должен содержать приватный ключ целиком, включая строки `BEGIN ... PRIVATE KEY` и `END ... PRIVATE KEY`.

## Запуск

Откройте workflow и нажмите `Run Now`. Заполните данные нового пользователя и поле SSH-адресов:

```text
192.168.1.10:22
192.168.1.11:2222
server.example.local:22
```

Каждая непустая строка создаёт отдельный SSH job. Команда workflow зафиксирована:

```sh
printf 'Hello World\n'
```

В результате каждого SSH job отображается таблица с адресом, портом, кодом завершения, STDOUT и STDERR.

## Проверка ключа SSH-хоста

В готовом workflow строгая проверка ключа выключена, потому что один workflow обрабатывает несколько разных серверов. В самом плагине `SSH — Выполнить команду` можно включить проверку и указать SHA256 fingerprint для одиночного хоста.
