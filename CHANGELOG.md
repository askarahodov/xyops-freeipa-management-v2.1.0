# Changelog

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
