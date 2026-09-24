# V4 — рецепты потребителя

Практические примеры для продукта, который использует опубликованный V4-пакет:
контентная страница, форма и страница с данными. Собранный интерфейс должен
работать без чтения исходников монорепозитория — только публичный API пакета и
его манифест. Спецификация — [README.md](README.md), план фаз — [PLAN.md](PLAN.md),
общий гайд — [../guide.md](../guide.md).

## Общие правила

- **Подстановка пакета.** В примерах указан `@prism-system/ui-system-a`. Замените
  его на выбранную систему — `@prism-system/ui-system-b` или пакет, созданный
  через `ds:create`. Имя меняется в двух местах: импорт компонентов из корня
  пакета и импорт стилей.
- **Только обязательные компоненты V4.** Все три рецепта работают с любой
  V4-системой: используются 20 обязательных компонентов, ни один дополнительный
  (`Table`, `Section`, `Toast` и т. п.) не требуется. Фактический набор системы
  показывают манифест `<package>/manifest` и `npx prism-ds components`.
- **Только публичные импорты.** Компоненты — из корня пакета; стили — из
  `<package>/styles.css` и `<package>/tailwind.css`; токены — из
  `<package>/tokens`. Внутренние пути пакета не импортируются.
- **Граница ответственности.** Prism поставляет визуальные компоненты и токены;
  продукт владеет данными, маршрутами, действиями и бизнес-логикой.

| Prism (пакет системы)                       | Продукт                                      |
| ------------------------------------------- | -------------------------------------------- |
| цвета, типографика, отступы, радиусы, тени  | данные и их источник (API, БД, статика)      |
| состояния, варианты и анимация компонентов  | маршруты и навигация                         |
| доступность универсальных компонентов       | действия, обработчики, бизнес-логика         |
| `styles.css` и Tailwind-мост                | раскладка, порядок блоков, состав страницы   |

В примерах нет `className` с цветами, радиусами, тенями и другими визуальными
значениями: их место — в дизайн-системе. Раскладку страницы продукт собирает из
`Container`, `Stack` и обычных HTML-элементов.

### Подключение CSS

Обычный CSS — один раз в точке входа приложения, до первого рендера компонентов:

```tsx
import "@prism-system/ui-system-a/styles.css";
```

Tailwind v4 подключается мостом пакета; порядок импортов важен:

```css
@import "tailwindcss";
@import "@prism-system/ui-system-a/tailwind.css";
@import "@prism-system/ui-system-a/styles.css";
```

Этот же блок ставит `npx prism-ds setup-tailwind --cwd . --css <file>`. Мост даёт
смысловые utility-классы для композиции страницы (например, `bg-prism-surface`);
компоненты берут внешний вид из `styles.css`, и переопределять его мостовыми
классами нельзя. Одна сборка подключает мост одной выбранной системы.

Примеры 2 и 3 интерактивны: в Next.js App Router им нужна директива
`"use client"` в начале файла.

## 1. Контентная (редакционная) страница

Заголовок, лид, секции статьи и блок подписки. Данные статьи передаёт продукт;
Prism оформляет типографику и повторяемые блоки.

```tsx
// article-page.tsx
import {
  Badge,
  Button,
  Card,
  Container,
  Heading,
  Link,
  Separator,
  Stack,
  Text,
} from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

export type Article = {
  category: string;
  title: string;
  lead: string;
  publishedAt: string;
  sections: { id: string; heading: string; body: string }[];
};

export function ArticlePage({ article }: { article: Article }) {
  return (
    <Container as="main">
      <Stack>
        <Stack direction="horizontal" wrap>
          <Badge variant="info">{article.category}</Badge>
          <Text as="span">Опубликовано {article.publishedAt}</Text>
        </Stack>

        <Heading level={1}>{article.title}</Heading>
        <Text>{article.lead}</Text>
        <Separator decorative />

        {article.sections.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-title`}>
            <Stack>
              <Heading level={2} id={`${section.id}-title`}>
                {section.heading}
              </Heading>
              <Text>{section.body}</Text>
            </Stack>
          </section>
        ))}

        <Card variant="muted">
          <Card.Header>
            <Card.Title>Дайджест раз в месяц</Card.Title>
            <Card.Description>
              Одно письмо с новыми материалами. Отписаться можно в любой момент.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Button variant="primary">Подписаться</Button>
          </Card.Content>
          <Card.Footer>
            <Link href="/archive">Все материалы</Link>
          </Card.Footer>
        </Card>
      </Stack>
    </Container>
  );
}
```

Что здесь чьё:

- `Container` берёт ширину из токенов системы, `Stack` задаёт вертикальный ритм;
  порядок блоков и текст — продукт.
- `Heading level` — семантика заголовка; как уровень выглядит, решает система.
- `Badge`, `Card`, `Separator` оформляют повторяемые части; значения вариантов
  объявлены манифестом системы.
- `/archive` и подписка — маршрут и действие продукта.

## 2. Форма с подсказкой и ошибкой

Поля на `FormField`, проверка по отправке, подсказки `Description` и сообщения
`Error`. Тексты и правила проверки — продукт; связи и доступность — Prism.

```tsx
// contact-form.tsx
"use client";

import * as React from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  RadioGroup,
  Stack,
  Text,
  Textarea,
} from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

type Topic = "bug" | "idea" | "billing";
type FormErrors = { email?: string; message?: string };

export function ContactForm() {
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [topic, setTopic] = React.useState<Topic>("bug");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!email.includes("@")) {
      nextErrors.email = "Введите адрес в формате name@company.com.";
    }
    if (message.trim().length < 20) {
      nextErrors.message = "Опишите ситуацию подробнее — минимум 20 символов.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    await submitContactRequest({ email, message, topic }); // действие продукта
    setSubmitting(false);
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Написать в поддержку</Card.Title>
        <Card.Description>Отвечаем в течение рабочего дня.</Card.Description>
      </Card.Header>
      <Card.Content>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            <FormField id="contact-email" required invalid={Boolean(errors.email)}>
              <FormField.Label>Электронная почта</FormField.Label>
              <FormField.Control asChild>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </FormField.Control>
              <FormField.Description>
                Используем адрес только для ответа.
              </FormField.Description>
              {errors.email ? <FormField.Error>{errors.email}</FormField.Error> : null}
            </FormField>

            <FormField id="contact-message" required invalid={Boolean(errors.message)}>
              <FormField.Label>Сообщение</FormField.Label>
              <FormField.Control asChild>
                <Textarea
                  rows={5}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </FormField.Control>
              <FormField.Description>
                Что случилось, где и когда — в двух-трёх предложениях.
              </FormField.Description>
              {errors.message ? <FormField.Error>{errors.message}</FormField.Error> : null}
            </FormField>

            <Stack>
              <Text as="p" id="contact-topic-label">
                Тема обращения
              </Text>
              <RadioGroup
                aria-labelledby="contact-topic-label"
                value={topic}
                onValueChange={(value) => setTopic(value as Topic)}
              >
                <RadioGroup.Item value="bug">Проблема</RadioGroup.Item>
                <RadioGroup.Item value="idea">Идея</RadioGroup.Item>
                <RadioGroup.Item value="billing">Оплата</RadioGroup.Item>
              </RadioGroup>
            </Stack>

            <Button type="submit" variant="primary" loading={submitting}>
              Отправить
            </Button>
          </Stack>
        </form>
      </Card.Content>
    </Card>
  );
}

// Здесь запрос к API продукта.
async function submitContactRequest(input: { email: string; message: string; topic: Topic }) {
  void input;
}
```

Как устроена доступность:

- Корень `FormField` получает **обязательный `id`** и владеет связями: `Label`
  связывается через `htmlFor`, `Description` и `Error` — через `aria-describedby`.
- `FormField.Control asChild` переносит на существующий контрол системы (`Input`,
  `Textarea`) его `id`, `aria-invalid`, `aria-required` и `aria-describedby`.
- `invalid` на корне выставляет `aria-invalid`; `FormField.Error` объявляется
  вспомогательным технологиям как живой регион / `role="alert"`.
- Группа радио подписана через `aria-labelledby`; момент проверки и тексты ошибок
  выбирает продукт.

## 3. Страница с данными

Продукт передаёт список проектов, фильтрует его и рисует карточки; навигация и
действия остаются функциями продукта.

```tsx
// projects-page.tsx
"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Card,
  Container,
  Heading,
  Link,
  Select,
  Stack,
  Text,
} from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

type ProjectStatus = "active" | "review" | "archived";

type Project = {
  id: string;
  name: string;
  summary: string;
  status: ProjectStatus;
  updatedAt: string;
};

const statusLabels: Record<ProjectStatus, string> = {
  active: "В работе",
  review: "На проверке",
  archived: "В архиве",
};

const statusVariants: Record<ProjectStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  review: "warning",
  archived: "secondary",
};

export function ProjectsPage({ projects }: { projects: Project[] }) {
  const [status, setStatus] = React.useState<ProjectStatus | "all">("all");

  // Данные, фильтрация и сортировка — логика продукта, не Prism.
  const visible = projects.filter(
    (project) => status === "all" || project.status === status,
  );

  return (
    <Container as="main">
      <Stack>
        <Stack direction="horizontal" wrap>
          <Heading level={1}>Проекты</Heading>
          <Button variant="primary" onClick={openCreateProject}>
            Новый проект
          </Button>
        </Stack>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ProjectStatus | "all")}
        >
          <Select.Trigger aria-label="Фильтр по статусу">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">Все статусы</Select.Item>
            <Select.Item value="active">В работе</Select.Item>
            <Select.Item value="review">На проверке</Select.Item>
            <Select.Item value="archived">В архиве</Select.Item>
          </Select.Content>
        </Select>

        {visible.length === 0 ? (
          <Text>Проектов с этим статусом нет.</Text>
        ) : (
          <Stack as="ul">
            {visible.map((project) => (
              <li key={project.id}>
                <Card variant="interactive">
                  <Card.Header>
                    <Card.Title>
                      <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    </Card.Title>
                    <Card.Description>{project.summary}</Card.Description>
                  </Card.Header>
                  <Card.Content>
                    <Stack direction="horizontal" wrap>
                      <Badge variant={statusVariants[project.status]}>
                        {statusLabels[project.status]}
                      </Badge>
                      <Text as="span">Обновлён {project.updatedAt}</Text>
                    </Stack>
                  </Card.Content>
                  <Card.Footer>
                    <Button variant="ghost" onClick={() => archiveProject(project.id)}>
                      В архив
                    </Button>
                  </Card.Footer>
                </Card>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

// Маршруты и действия принадлежат продукту: router.push, вызов API и т. д.
function openCreateProject() {}

function archiveProject(projectId: string) {
  void projectId;
}
```

Что здесь чьё:

- `Stack as="ul"` даёт список, а `Card` — повторяемую строку; какие поля показать,
  решает продукт.
- Список собран из обязательных компонентов, потому что `Table` — дополнительный
  контракт и есть не у каждой системы. Если у выбранной системы есть
  `Table`/`Pagination`, продукт может добавить их поверх той же структуры.
- Навигация `/projects/<id>` и действия «Новый проект» и «В архив» — маршруты и
  обработчики продукта: Prism даёт кнопкам и ссылкам вид, но не решает, что они
  делают.
- Если система объявила дополнительные компоненты, усиливать ими страницы можно,
  но базовый состав от них не зависит.

## После сборки

```bash
npx prism-ds check --cwd . --css <file>
npx prism-ds check-usage --cwd .
```

`check` сверяет конфиг, публичные CSS-импорты и доступность компонентов;
`check-usage` ищет обходы дизайн-системы (произвольные цвета, радиусы, тени,
локальные дубликаты компонентов). Обе команды работают офлайн и только читают
файлы продукта.
