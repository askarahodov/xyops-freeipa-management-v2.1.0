# Workflow: создание пользователя FreeIPA и SSH Hello World

Файлы импорта:

1. `xyops-ssh-plugin.json` — SSH Event Plugin;
2. `workflow-create-user-ssh.json` — workflow.

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

## Обязательный порядок импорта

xyOps проверяет все ссылки workflow до создания объектов из текущего XYPDF. Поэтому SSH-плагин должен существовать заранее.

1. Импортируйте основной `xyops.json` и убедитесь, что существует плагин `FreeIPA — Создать пользователя` с ID `pmlc2ha8fipa_create`.
2. Импортируйте `xyops-ssh-plugin.json`.
3. Проверьте, что в Plugins появился `SSH — Выполнить команду` с ID `pmlc2ha8fssh1`.
4. Только после этого импортируйте `workflow-create-user-ssh.json`.
5. Если xyOps предложит обновить уже существующий SSH-плагин из второго файла, подтвердите замену.
6. Убедитесь, что target с ID `main` существует и имеет доступ к FreeIPA и SSH-серверам.

При нарушении порядка возникает ошибка:

```text
Malformed workflow node #nsshexec01: Unknown Plugin ID: pmlc2ha8fssh1
```

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
