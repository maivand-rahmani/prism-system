# Maivand Design Systems

Монорепозиторий, в котором **дизайн-системы создаются и проверяются отдельно от
продуктов**, а затем подключаются в реальные продукты как обычный npm-пакет.

Простыми словами: здесь живёт «внешний вид» (цвета, шрифты, отступы, состояния,
анимации), а не бизнес-логика продукта. Продукт берёт готовую дизайн-систему и
собирает из неё свои экраны.

## Как это устроено

- `@prism-system/ui-core` — **фундамент и правила**. Он описывает единственный
  текущий контракт компонентов: **29 обязательных компонентов и 17 дополнительных
  контрактов** (`contractVersion: 4`). Цветов, отступов и стилей в нём нет.
- `@prism-system/ui-system-a` / `@prism-system/ui-system-b` — **готовые наборы
  внешнего вида**: смысловые токены, CSS, варианты, состояния, анимации. Каждая
  система реализует все 29 обязательных компонентов и объявляет в манифесте только
  те дополнительные, которые действительно реализовала: у System A это `Grid`,
  `Fieldset`, `Alert`, `Progress`, `Accordion`, `Pagination`, `Table`, `Metric`,
  `DescriptionList`, `Meter`, `Timeline`, у System B — `Section`, `Alert`,
  `Skeleton`, `Toast`, `Avatar`, `Breadcrumbs`, `Metric`, `Timeline`, `EmptyState`.
  Внешний вид A и B разный, а обязательная часть публичного API — взаимозаменяемая.
- `apps/showcase` — **витрина**: живой каталог зарегистрированных систем,
  Foundations и компонентов по маршруту `/showcase/<id>`.
- `apps/reference-app` — **тестовая комната**. Один и тот же интерфейс собирается
  то на System A, то на System B, чтобы различия были видны честно.
- Продукт — **покупатель**. Он устанавливает пакет и пользуется готовым внешним
  видом, а не переделывает его у себя.

## Структура

```text
design-systems/
├── apps/
│   ├── showcase/          # витрина компонентов
│   └── reference-app/     # тестовая сборка интерфейса
├── packages/
│   ├── core/              # @prism-system/ui-core — общий «фундамент» без стилей
│   ├── system-a/          # @prism-system/ui-system-a — дизайн-система A
│   ├── system-b/          # @prism-system/ui-system-b — дизайн-система B
│   └── tools/             # @prism-system/tools — инструмент потребителя (prism-ds)
├── templates/design-system/   # шаблон для новых дизайн-систем
├── fixtures/consumer-product/ # пример продукта-потребителя
├── skills/                # инструкции для coding-агентов (create/use/modify)
├── scripts/               # детерминированные команды (ds:*)
├── config/                # реестр дизайн-систем
├── schemas/               # JSON-схемы манифестов и конфигов
└── docs/
    ├── guide.md           # руководство для человека
    ├── v4/                # текущая спецификация, рецепты и критерии качества
    └── archive/           # исторические материалы разработки
```

## Требования

- Node.js `>= 20.19.0`
- pnpm `>= 10` (в репозитории зафиксирован `pnpm@10.34.5`)

## Первый запуск

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```

## Контракт

Текущий контракт один — **версия 4**; в runtime его отмечает числовое поле
`contractVersion: 4`. Он состоит из:

- **29 обязательных компонентов** — их обязана реализовать каждая система:

  ```text
  Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
  Tabs, Dialog, DropdownMenu, Tooltip, Separator, Heading, Text, Link, Container,
  Stack, FormField, Center, Cluster, Sidebar, AspectRatio, Combobox, DatePicker,
  NumberField, Slider, FileUpload
  ```

- **17 дополнительных контрактов** — система реализует только те, которые
  действительно умеет, и объявляет их в своём descriptor и манифесте:

  ```text
  Grid, Section, Fieldset, Alert, Progress, Skeleton, Toast, Accordion,
  Avatar, Breadcrumbs, Pagination, Table, Metric, DescriptionList, Timeline,
  Meter, EmptyState
  ```

Фактический набор конкретной системы публикует сгенерированный манифест
`design-system.json` (`schemaVersion: 4`, `contractVersion: 4`; публичный путь
`<package>/manifest`). Доступность определяет только наличие ключа в `components`
манифеста; верхнеуровневый `capabilities.categories` (`composition`, `forms`,
`data-display`) — канонический перечень принадлежности категориям, одинаковый у
всех систем, а не второй список доступности, и категории покрывают не все
контракты. Package-owned descriptor `design-system.source.json` остаётся
`schemaVersion: 3` и служит только входом генератора; блок `capabilities` в него
не добавляют и не повторяют. Дополнительный компонент — это настоящая
возможность, а не заглушка; если имени нет в манифесте, компонент недоступен.
Форма манифеста одна: читатели `schemaVersion: 3` обновляются вместе с системой —
текущий `prism-ds` требует schema 4, а старый не прочитает schema-4 манифест.
Подробности — в [текущей спецификации](docs/v4/README.md).

## Состояние

- обе тестовые системы реализуют контракт версии 4 и зарегистрированы в
  `config/design-systems.json`;
- Showcase и Reference App собираются из реестра и переключают системы без
  изменения интерфейса;
- версии пакетов ведутся через Changesets и синхронизируются командой
  `pnpm ds:sync-versions`; публикация в npm остаётся отдельным ручным шагом и
  локальными командами не выполняется;
- материалы завершённых этапов разработки лежат в
  [`docs/archive/`](docs/archive/README.md) и не являются текущей документацией.

## Команды

| Команда                                | Что делает                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| `pnpm install`                         | Установить зависимости workspace                               |
| `pnpm dev`                             | Запустить все dev-цели через Turborepo                         |
| `pnpm build`                           | Собрать все пакеты (сначала зависимости)                       |
| `pnpm typecheck`                       | Проверить типы во всех пакетах                                 |
| `pnpm lint`                            | Запустить линтер                                               |
| `pnpm test`                            | Node-регрессии (запускать после сборки)                        |
| `pnpm format`                          | Отформатировать репозиторий Prettier                           |
| `pnpm ds:create <id>`                  | Создать новую дизайн-систему из шаблона                        |
| `pnpm ds:register <id>`                | Зарегистрировать систему и синхронизировать приложения         |
| `pnpm ds:check <id>`                   | Проверить пакет дизайн-системы                                 |
| `pnpm ds:manifest <id> [--write]`      | Проверить или пересобрать `design-system.json`                 |
| `pnpm ds:sync-versions [id] [--check]` | Синхронизировать версии (runtime / манифест / реестр)          |
| `pnpm ds:release <id> --approved`      | Подготовить релиз (никогда не версионирует и не публикует)     |
| `pnpm ds:check-tools`                  | Проверить `prism-ds` и манифесты на упакованных артефактах     |
| `pnpm ds:check-docs`                   | Проверить активную документацию и её локальные ссылки          |
| `pnpm ds:check-all`                    | Полный приёмочный прогон по собранным и упакованным артефактам |
| `pnpm ds:connect --cwd <root>`         | Настроить продукт-потребитель (обёртка над `prism-ds connect`) |
| `pnpm ds:check-usage --cwd <root>`     | Проверить строгое использование системы в продукте (обёртка)   |
| `pnpm changeset`                       | Описать изменение для следующего релиза                        |

### Инструмент для продукта (npm): `@prism-system/tools`

Команды `ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, `ds:check-tools`, `ds:check-docs` и `ds:check-all` — это **инструменты
мейнтейнера** этого репозитория. Они не публикуются и не нужны, чтобы пользоваться
уже выпущенной дизайн-системой.

Потребительская часть жизненного цикла публикуется отдельным пакетом
[`@prism-system/tools`](packages/tools/README.md) с исполнимым файлом `prism-ds`.
Продукт устанавливает его обычным способом и работает без доступа к этому репозиторию:

```bash
npm install --save-dev @prism-system/tools
npm install @prism-system/ui-system-a

# найти и изучить опубликованные системы (сеть, только чтение)
npx prism-ds search "calm editorial"
npx prism-ds info @prism-system/ui-system-a --json

# явно установить и подключить (install/use/upgrade меняют зависимости продукта)
npx prism-ds use @prism-system/ui-system-a --cwd . --check-usage

# каталог установленной системы (офлайн, только манифест)
npx prism-ds components Button --cwd .
npx prism-ds tokens color --cwd .

# обычный CSS и мост к Tailwind v4 (офлайн; меняется только указанный файл)
npx prism-ds setup-tailwind --cwd . --css app/globals.css --check

# отчёт о состоянии продукта и офлайн-диагностика
npx prism-ds check --cwd .
npx prism-ds connect @prism-system/ui-system-a --cwd .
npx prism-ds check-usage --cwd .
npx prism-ds doctor --cwd .

# обновление до точной версии с диффом манифеста
npx prism-ds upgrade @prism-system/ui-system-a <exact-version> --cwd . --dry-run
```

Границы возможностей `prism-ds`:

- `search` и `info` — **явная сеть, только чтение**: они ничего не устанавливают, не
  пишут в продукт и не трогают этот репозиторий;
- `install`, `use` и `upgrade` — **единственные команды, которые меняют зависимости
  продукта**; они сначала проверяют точную версию в реестре, затем запускают
  фиксированную команду npm/pnpm с `--ignore-scripts` и без пользовательских
  аргументов, после чего проверяют установленный пакет (у `upgrade` — ещё и
  сравнивают манифесты);
- `connect`, `components`, `tokens`, `check`, `check-usage`, `doctor` и
  `setup-tailwind` — **офлайн**: не устанавливают пакеты, не меняют зависимости и не
  копируют исходники. `connect` пишет только consumer-конфиг и инструкции,
  `setup-tailwind` меняет только явно указанный CSS-файл, `check`/`doctor`/каталоги
  ничего не пишут.

Публичный контракт для продукта — это `.design-system/config.json`, манифест
`<package>/manifest` и `AGENTS.md` установленного пакета. Команды `pnpm ds:connect`
и `pnpm ds:check-usage` — это совместимые обёртки над тем же кодом.

`pnpm version-packages-and-sync` и `pnpm version-packages` — это **автоматизация
для CI**, а не обычная команда для начинающего. Их запускает workflow, когда
готовит version PR.

## Версионирование и публикация

Версионирование и публикация пакетов в npm остаются **ручными шагами,
управляемыми человеком** через [Changesets](https://github.com/changesets/changesets):

1. автор добавляет Changeset (`pnpm changeset`);
2. CI готовит version PR (в нём версии синхронизируются);
3. после ревью PR сливается;
4. публикация запускается отдельным workflow в защищённом окружении.

Локальные команды (`ds:release`, `ds:check`, `ds:check-tools`, `ds:check-docs`,
`ds:check-all`) **никогда не публикуют и не версионируют** пакеты сами. Подробнее —
в [`docs/guide.md`](docs/guide.md) и [`.changeset/README.md`](.changeset/README.md).

## Что почитать дальше

- **Подробный гайд для человека:** [`docs/guide.md`](docs/guide.md)
- **Правила для coding-агентов:** [`AGENTS.md`](AGENTS.md)
- **Текущая спецификация:** [`docs/v4/README.md`](docs/v4/README.md)
- **Рецепты потребителя:** [`docs/v4/recipes.md`](docs/v4/recipes.md)
- **Критерии качества и проверки CI:** [`docs/v4/quality.md`](docs/v4/quality.md)
- **Пакеты:** [`packages/core/README.md`](packages/core/README.md),
  [`packages/system-a/README.md`](packages/system-a/README.md),
  [`packages/system-b/README.md`](packages/system-b/README.md),
  [`packages/tools/README.md`](packages/tools/README.md)
- **Приложения:** [`apps/showcase/README.md`](apps/showcase/README.md),
  [`apps/reference-app/README.md`](apps/reference-app/README.md)
- **Skills:** [`skills/create-design-system/SKILL.md`](skills/create-design-system/SKILL.md),
  [`skills/use-design-system/SKILL.md`](skills/use-design-system/SKILL.md),
  [`skills/modify-design-system/SKILL.md`](skills/modify-design-system/SKILL.md)
- **Архив истории:** [`docs/archive/README.md`](docs/archive/README.md)
- **Пример продукта-потребителя:**
  [`fixtures/consumer-product/README.md`](fixtures/consumer-product/README.md)
