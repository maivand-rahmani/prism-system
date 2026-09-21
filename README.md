# Maivand Design Systems

Монорепозиторий, в котором **дизайн-системы создаются и проверяются отдельно от
продуктов**, а затем подключаются в реальные продукты как обычный npm-пакет.

Простыми словами: здесь живёт «внешний вид» (цвета, шрифты, отступы, состояния,
анимации), а не бизнес-логика продукта. Продукт берёт готовую дизайн-систему и
собирает из неё свои экраны.

## Аналогия

- `@prism-system/ui-core` — **фундамент и правила**. Он говорит, какие компоненты
  обязаны быть (14 штук) и какого они типа. Но в нём нет ни одного цвета или стиля.
- `@prism-system/ui-system-a` / `@prism-system/ui-system-b` — **готовые наборы
  внешнего вида**. Здесь лежат цвета, шрифты, отступы, радиусы, тени, состояния и
  анимации. Внешний вид A и B разный, а набор компонентов одинаковый.
- `apps/showcase` — **витрина**. Показывает каждый компонент по отдельности.
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
└── docs/                  # спецификации V1/V2/V3 и этот гайд
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
- **Спецификации:** [`docs/v1/README`](docs/v1/README),
  [`docs/v2/README`](docs/v2/README), [`docs/v3/README`](docs/v3/README)
- **Пример продукта-потребителя:**
  [`fixtures/consumer-product/README.md`](fixtures/consumer-product/README.md)

## Команды

| Команда                                | Что делает                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| `pnpm install`                         | Установить зависимости workspace                               |
| `pnpm dev`                             | Запустить все dev-цели через Turborepo                         |
| `pnpm build`                           | Собрать все пакеты (сначала зависимости)                       |
| `pnpm typecheck`                       | Проверить типы во всех пакетах                                 |
| `pnpm lint`                            | Запустить линтер                                               |
| `pnpm format`                          | Отформатировать репозиторий Prettier                           |
| `pnpm ds:create <id>`                  | Создать новую дизайн-систему из шаблона                        |
| `pnpm ds:register <id>`                | Зарегистрировать систему и синхронизировать приложения         |
| `pnpm ds:check <id>`                   | Проверить пакет дизайн-системы                                 |
| `pnpm ds:manifest <id> [--write]`      | Проверить или пересобрать `design-system.json`                 |
| `pnpm ds:sync-versions [id] [--check]` | Синхронизировать версии (runtime / манифест / реестр)          |
| `pnpm ds:release <id> --approved`      | Подготовить релиз (никогда не версионирует и не публикует)     |
| `pnpm ds:connect --cwd <root>`         | Настроить продукт-потребитель (V3, обёртка)                    |
| `pnpm ds:check-usage --cwd <root>`     | Проверить строгое использование дизайн-системы в продукте (V3) |
| `pnpm ds:check-v3`                     | Сквозная проверка жизненного цикла V3 на собранных пакетах     |
| `pnpm changeset`                       | Описать изменение для следующего релиза                        |

### Инструмент для продукта (npm): `@prism-system/tools`

Команды `ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release` и `ds:check-v3` — это **инструменты мейнтейнера** этого репозитория. Они не
публикуются и не нужны, чтобы пользоваться уже выпущенной дизайн-системой.

Потребительская часть жизненного цикла публикуется отдельным пакетом
[`@prism-system/tools`](packages/tools/README.md) с исполнимым файлом `prism-ds`.
Продукт устанавливает его обычным способом и работает без доступа к этому репозиторию:

```bash
npm install --save-dev @prism-system/tools
npm install @prism-system/ui-system-a

# найти и изучить опубликованные системы (сеть, только чтение)
npx prism-ds search "calm editorial"
npx prism-ds info @prism-system/ui-system-a --json

# явно установить и подключить (install/use меняют зависимости продукта)
npx prism-ds use @prism-system/ui-system-a --cwd . --check-usage

# офлайн-команды
npx prism-ds connect @prism-system/ui-system-a --cwd .
npx prism-ds check-usage --cwd .
npx prism-ds doctor --cwd .
```

Границы возможностей `prism-ds`:

- `search` и `info` — **явная сеть, только чтение**: они ничего не устанавливают, не
  пишут в продукт и не трогают этот репозиторий;
- `install` и `use` — **единственные команды, которые меняют зависимости продукта**;
  они сначала проверяют точную версию в реестре, затем запускают фиксированную команду
  npm/pnpm с `--ignore-scripts` и без пользовательских аргументов, после чего
  проверяют установленный пакет;
- `connect`, `check-usage` и `doctor` — **офлайн**: не устанавливают пакеты, не меняют
  зависимости, не копируют исходники и не читают этот репозиторий.

Публичный контракт для продукта — это `.design-system/config.json`, манифест
`<package>/manifest` и `AGENTS.md` установленного пакета. Команды `pnpm ds:connect` и
`pnpm ds:check-usage` — это совместимые обёртки над тем же кодом.

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

Локальные команды (`ds:release`, `ds:check`, `ds:check-v3`) **никогда не
публикуют и не версионируют** пакеты сами. Подробнее — в
[`docs/guide.md`](docs/guide.md) и [`.changeset/README.md`](.changeset/README.md).
