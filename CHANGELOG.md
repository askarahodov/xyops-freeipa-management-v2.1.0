# Changelog

## v2.5.0

- оставлен один основной workflow: создание пользователя FreeIPA, затем локального пользователя на SSH-хостах;
- удалён отдельный workflow без FreeIPA;
- SSH-импорт сокращён до одного Plugin `SSH — Создать локального пользователя`;
- удалён универсальный Plugin выполнения произвольной SSH-команды;
- Linux-логика вынесена в простой `scripts/create-local-user.sh`;
- скрипт создаёт или обновляет пользователя, пароль, home, authorized_keys и sudo;
- пароль root и глобальный `sshd_config` не изменяются;
- `xyops.json` продолжает содержать `Управление FreeIPA`, создание и восстановление пользователя.

## v2.4.1

- добавлен отдельный workflow `Создать локального пользователя на SSH-хостах` без FreeIPA;
- пользователь заполняет только логин, пароль, публичный ключ, sudo-параметры и список SSH-хостов;
- workflow использует существующий Plugin `SSH — Создать локального пользователя` и не требует поля `Команда`;
- список хостов обрабатывается Split Controller по одному адресу на отдельный SSH Job;
- добавлена отдельная инструкция `WORKFLOW_LOCAL_USER.md` и regression-тест структуры workflow.

## v2.4.0

- workflow после создания пользователя FreeIPA разворачивает одноимённую локальную Linux-учётную запись на каждом SSH-хосте;
- пароль из поля `initial_password` используется одновременно для FreeIPA и локальной учётной записи;
- добавлен обязательный публичный SSH-ключ нового пользователя;
- создаются домашний каталог, `.ssh/authorized_keys` и отдельное правило `/etc/sudoers.d/90-xyops-<user>`;
- sudo по умолчанию требует пароль пользователя, опционально поддерживается `NOPASSWD`;
- SSH-аккаунт автоматизации может выполнять sudo через `SSH_SUDO_PASSWORD` или через существующий `SSH_PASSWORD`;
- пароль root, глобальный `sshd_config` и пакетный менеджер больше не изменяются;
- чувствительные значения не возвращаются в `ssh_command`, таблицу или Output Data.

## v2.3.2

- исправлена ошибка импорта `Invalid plugin parameter value 'connect_timeout_seconds' (1 - 300 / 1)`;
- готовый workflow теперь передаёт числовой SSH-тайм-аут `15`, а не макрос;
- из описания параметра SSH-плагина удалён `range`, несовместимый с workflow-макросами при импорте;
- проверка допустимого диапазона 1–300 секунд остаётся в коде SSH-плагина при запуске.

## v2.3.1

- исправлена ошибка импорта `Malformed workflow node #nsshexec01: Unknown Plugin ID: pmlc2ha8fssh1`;
- SSH Event Plugin и Workflow разделены на два XYPDF-файла;
- `xyops-ssh-plugin.json` необходимо импортировать перед `workflow-create-user-ssh.json`;
- workflow-файл больше не содержит новый Plugin и проверяется только после его установки;
- добавлен тест обязательного порядка импорта.

## v2.3.0

- добавлен Event Plugin `SSH — Выполнить команду`;
- поддержаны адреса `host:port`, IPv4, DNS и IPv6 в квадратных скобках;
- SSH-аутентификация выполняется через Secret Vault с паролем или приватным ключом;
- добавлен portable workflow `Создать пользователя FreeIPA → SSH Hello World`;
- после успешного создания пользователя список SSH-адресов обрабатывается Split Controller по одному адресу на job;
- каждый SSH job выполняет `printf 'Hello World\n'` и возвращает STDOUT, STDERR и exit code;
- добавлены проверки формата workflow и SSH-параметров.

## v2.2.2

- во все динамические списки пользователей и групп добавлен первый пункт `(None)` с пустым `id`;
- одиночные Bucket Menu теперь можно очистить после выбора;
- пустое значение группы отфильтровывается перед вызовом FreeIPA;
- реальные счётчики пользователей и групп не включают служебный пункт `(None)`.

## v2.2.1

- исправлена ошибка импорта `Toolset Data Error: field type is invalid`;
- динамические `Bucket Menu` перенесены из `toolset.fields` в параметры верхнего уровня;
- основной интерфейс использует общие поля `uid`, `groups` и `user_group_filter`;
- создание и восстановление пользователя вынесены в отдельные Event Plugins;
- `configure-repository.sh` теперь обновляет команду запуска во всех FreeIPA-плагинах XYPDF;
- добавлена проверка, запрещающая неподдерживаемые типы вложенных полей Toolset.

## v2.2.0

- добавлена операция `sync_directory_cache`;
- добавлен Storage Bucket `bfreeipacache` в импортируемый XYPDF;
- поля существующих пользователей и групп переведены на Bucket Menu;
- группы для создания пользователя и изменения членства переведены на multi-select Bucket Menu;
- добавлены отдельные списки активных, отключённых и сохранённых пользователей;
- добавлены `freeipa_user_ids` и `freeipa_group_names` в выходные данные операций списка;
- изменяющие операции возвращают `freeipa_cache_refresh_required`;
- исправлена команда запуска на текущий репозиторий и ветку `main`;
- обновлены документация, описание пакета и тесты.

## v2.1.0

- added minimum xyOps version metadata (`1.0.83`);
- changed the initial password field to the masked `password` variant;
- added a repository configuration helper;
- added marketplace-ready `logo.png`;
- added package validation scripts.

## v2.0.0

- initial multi-operation FreeIPA management plugin.
