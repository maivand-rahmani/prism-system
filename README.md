# Maivand Design Systems

Монорепозиторий, в котором **дизайн-системы создаются и проверяются отдельно от
продуктов**, а затем подключаются в реальные продукты как обычный npm-пакет.

Простыми словами: здесь живёт «внешний вид» (цвета, шрифты, отступы, состояния,
анимации), а не бизнес-логика продукта. Продукт берёт готовую дизайн-систему и
собирает из неё свои экраны.

## Аналогия

- `@prism-system/ui-core` — **фундамент и правила**. Он описывает контракты
  компонентов: действующий V2 (14 компонентов) и дополнительный слой V4 — 20
  обязательных и 12 дополнительных контрактов. Цветов, отступов и стилей в нём
  нет.
- `@prism-system/ui-system-a` / `@prism-system/ui-system-b` — **готовые наборы
  внешнего вида**: смысловые токены, CSS, варианты, состояния, анимации. Каждая
  система реализует все 20 обязательных компонентов V4 и объявляет в манифесте
  только те дополнительные, которые действительно реализовала: у System A это
  `Grid`, `Fieldset`, `Alert`, `Progress`, `Accordion`, `Pagination`, `Table`, у
  System B — `Section`, `Alert`, `Skeleton`, `Toast`, `Avatar`, `Breadcrumbs`.
  Внешний вид A и B разный, а общая часть публичного API — взаимозаменяемая.
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
└── docs/                  # руководство, архив V1–V3, спецификация и план V4
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

## Статус V4

План V4 состоит из пяти фаз ([`docs/v4/PLAN.md`](docs/v4/PLAN.md)).
Реализованы фазы 1–3: контракты и источники истины, единая структура и обе
системы с 20 обязательными компонентами, Tailwind v4 bridge и потребительский
CLI `prism-ds`. Фаза 4 (Showcase/Reference App и единая документация) в работе;
фаза 5 (сквозная проверка на упакованных артефактах и подготовка версии `0.4.0`)
не начата. Версии опубликованных пакетов поднимаются только на фазе 5 через
Changesets, а публикация всегда остаётся ручным решением человека.

## Что почитать дальше

- **Подробный гайд для человека:** [`docs/guide.md`](docs/guide.md)
- **Правила для coding-агентов:** [`AGENTS.md`](AGENTS.md)
- **Пакеты:** [`packages/core/README.md`](packages/core/README.md),
  [`packages/system-a/README.md`](packages/system-a/README.md),
  [`packages/system-b/README.md`](packages/system-b/README.md),
  [`packages/tools/README.md`](packages/tools/README.md)
- **Приложения:** [`apps/showcase/README.md`](apps/showcase/README.md),
  [`apps/reference-app/README.md`](apps/reference-app/README.md)
- **Skills:** [`skills/create-design-system/SKILL.md`](skills/create-design-system/SKILL.md),
  [`skills/use-design-system/SKILL.md`](skills/use-design-system/SKILL.md),
  [`skills/modify-design-system/SKILL.md`](skills/modify-design-system/SKILL.md)
- **V4:** [спецификация](docs/v4/README.md) и [план из пяти фаз](docs/v4/PLAN.md)
- **Архив спецификаций:** [`V1`](docs/archive/v1/README),
  [`V2`](docs/archive/v2/README), [`V3`](docs/archive/v3/README)
- **Пример продукта-потребителя:**
  [`fixtures/consumer-product/README.md`](fixtures/consumer-product/README.md)

## Команды

| Команда                                | Что делает                                                       |
| -------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install`                         | Установить зависимости workspace                                 |
| `pnpm dev`                             | Запустить все dev-цели через Turborepo                           |
| `pnpm build`                           | Собрать все пакеты (сначала зависимости)                         |
| `pnpm typecheck`                       | Проверить типы во всех пакетах                                   |
| `pnpm lint`                            | Запустить линтер                                                 |
| `pnpm format`                          | Отформатировать репозиторий Prettier                             |
| `pnpm ds:create <id>`                  | Создать новую дизайн-систему из шаблона                          |
| `pnpm ds:register <id>`                | Зарегистрировать систему и синхронизировать приложения           |
| `pnpm ds:check <id>`                   | Проверить пакет дизайн-системы                                   |
| `pnpm ds:manifest <id> [--write]`      | Проверить или пересобрать `design-system.json`                   |
| `pnpm ds:sync-versions [id] [--check]` | Синхронизировать версии (runtime / манифест / реестр)            |
| `pnpm ds:release <id> --approved`      | Подготовить релиз (никогда не версионирует и не публикует)       |
| `pnpm ds:connect --cwd <root>`         | Настроить продукт-потребитель (обёртка над `prism-ds connect`)   |
| `pnpm ds:check-usage --cwd <root>`     | Проверить строгое использование системы в продукте (обёртка)     |
| `pnpm ds:check-v4-tools`               | Проверить `prism-ds` и V2/V4-манифесты на упакованных артефактах |
| `pnpm ds:check-v3`                     | Историческая сквозная проверка V3 (V2-пакеты и шаблон)           |
| `pnpm changeset`                       | Описать изменение для следующего релиза                          |

### Инструмент для продукта (npm): `@prism-system/tools`

Команды `ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, `ds:check-v4-tools` и `ds:check-v3` — это **инструменты мейнтейнера**
этого репозитория. Они не публикуются и не нужны, чтобы пользоваться уже выпущенной
дизайн-системой.

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

Локальные команды (`ds:release`, `ds:check`, `ds:check-v4-tools`, `ds:check-v3`)
**никогда не публикуют и не версионируют** пакеты сами. Подробнее — в
[`docs/guide.md`](docs/guide.md) и [`.changeset/README.md`](.changeset/README.md).
