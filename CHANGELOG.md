# Changelog

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
- поля существующих пользователей переведены на Bucket Menu;
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
