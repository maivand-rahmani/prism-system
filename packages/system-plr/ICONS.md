# Icons

`@prism-system/ui-system-plr` ships the complete Prism icon catalog: fifty semantic
names, each exported as one stable React component from a dedicated public entrypoint.

```tsx
import { SearchIcon, LoadingIcon } from "@prism-system/ui-system-plr/icons";

<SearchIcon aria-hidden="true" />
<SearchIcon size={20} aria-hidden="true" />

// A meaningful standalone icon owns its accessible name.
<SuccessIcon label="Saved" />

// An icon-only button names the button, not the icon.
<Button type="button" aria-label="Search">
  <SearchIcon aria-hidden="true" />
</Button>
```

Importing one icon never requires importing the whole set: `./icons` is a separate
ESM/CJS entrypoint with named exports and tree-shakable `lucide-react` imports.

## API

Every icon accepts the shared `IconProps` from `@prism-system/ui-core`:

- `size?: number | string` — defaults to `1em`, so the icon follows its text or
  control. Width and height are set together.
- `className`, `style`, and every standard SVG attribute — passed through.
- `ref` — forwards to the `SVGSVGElement` through `forwardRef`, on React 18 and 19.
- `label?: string` — accessible name for a meaningful icon.
- `decorative?: boolean` — force the safe hidden treatment even when a label exists.

Color is inherited with `currentColor`. The system never requires a color prop: in a
PLR scope the icon uses the system's ink, and status icons can inherit a status color
from their surrounding text or component. The default stroke is `1.75`, chosen to sit
quietly beside Literata and Manrope; a consumer may override `strokeWidth` for a
specific composition.

Icons render no focus stop and have `focusable="false"`. A purely decorative icon is
`aria-hidden="true"` by default. An icon-only control must carry its own accessible
name (`aria-label` or visible text); keep the icon decorative inside it.

`LoadingIcon` is static by default. When pending motion is appropriate, opt in with the
system's class; it is removed automatically under `prefers-reduced-motion`:

```tsx
<LoadingIcon className="maivand-plr-icon-spin" aria-hidden="true" />
```

## Canonical names and Lucide glyphs

The public Prism name is stable even if the underlying drawing changes. The current
PLR implementation uses these Lucide glyphs:

| Prism          | Export               | Lucide                     | Purpose                                    |
| -------------- | -------------------- | -------------------------- | ------------------------------------------ |
| ArrowLeft      | `ArrowLeftIcon`      | `ArrowLeft`                | Move or point left                         |
| ArrowRight     | `ArrowRightIcon`     | `ArrowRight`               | Move or point right                        |
| ArrowUp        | `ArrowUpIcon`        | `ArrowUp`                  | Move or point up                           |
| ArrowDown      | `ArrowDownIcon`      | `ArrowDown`                | Move or point down                         |
| ChevronLeft    | `ChevronLeftIcon`    | `ChevronLeft`              | Previous or collapse left                  |
| ChevronRight   | `ChevronRightIcon`   | `ChevronRight`             | Next or expand right                       |
| ChevronUp      | `ChevronUpIcon`      | `ChevronUp`                | Collapse or move up                        |
| ChevronDown    | `ChevronDownIcon`    | `ChevronDown`              | Expand or move down                        |
| Menu           | `MenuIcon`           | `Menu`                     | Open a menu                                |
| Home           | `HomeIcon`           | `House`                    | Home destination                           |
| Plus           | `PlusIcon`           | `Plus`                     | Add or create                              |
| Minus          | `MinusIcon`          | `Minus`                    | Remove or decrease                         |
| Close          | `CloseIcon`          | `X`                        | Dismiss; distinct from the circled Error   |
| Check          | `CheckIcon`          | `Check`                    | Confirm; distinct from the circled Success |
| Search         | `SearchIcon`         | `Search`                   | Search or find                             |
| Filter         | `FilterIcon`         | `Funnel`                   | Filter a list                              |
| Settings       | `SettingsIcon`       | `Settings`                 | Settings or preferences                    |
| Edit           | `EditIcon`           | `Pencil`                   | Edit or rename                             |
| Trash          | `TrashIcon`          | `Trash`                    | Delete or discard                          |
| Copy           | `CopyIcon`           | `Copy`                     | Copy to the clipboard                      |
| Download       | `DownloadIcon`       | `Download`                 | Download or save locally                   |
| Upload         | `UploadIcon`         | `Upload`                   | Upload or send                             |
| Share          | `ShareIcon`          | `Share`                    | Share with another destination             |
| Link           | `LinkIcon`           | `Link`                     | A link or URL                              |
| ExternalLink   | `ExternalLinkIcon`   | `ExternalLink`             | Open in another context                    |
| File           | `FileIcon`           | `File`                     | A single document                          |
| Folder         | `FolderIcon`         | `Folder`                   | A folder or collection                     |
| Image          | `ImageIcon`          | `Image`                    | An image or media asset                    |
| Calendar       | `CalendarIcon`       | `Calendar`                 | A date or schedule                         |
| Clock          | `ClockIcon`          | `Clock`                    | A time or duration                         |
| Info           | `InfoIcon`           | `Info`                     | Neutral information                        |
| Help           | `HelpIcon`           | `CircleQuestionMark`       | Help or explanation                        |
| Warning        | `WarningIcon`        | `TriangleExclamationPoint` | Warning, not a failure                     |
| Error          | `ErrorIcon`          | `CircleExclamationPoint`   | Error; distinct from Close                 |
| Success        | `SuccessIcon`        | `CircleCheck`              | Completed; distinct from Check             |
| Loading        | `LoadingIcon`        | `LoaderCircle`             | Pending work (opt-in motion)               |
| Eye            | `EyeIcon`            | `Eye`                      | Show or reveal                             |
| EyeOff         | `EyeOffIcon`         | `EyeOff`                   | Hide or conceal                            |
| Lock           | `LockIcon`           | `Lock`                     | Locked or read-only                        |
| Unlock         | `UnlockIcon`         | `LockOpen`                 | Unlocked or editable                       |
| User           | `UserIcon`           | `User`                     | A person or account                        |
| Users          | `UsersIcon`          | `Users`                    | A group or team                            |
| Mail           | `MailIcon`           | `Mail`                     | Email or message                           |
| Bell           | `BellIcon`           | `Bell`                     | Notifications or alerts                    |
| Heart          | `HeartIcon`          | `Heart`                    | Favourite or appreciation                  |
| Star           | `StarIcon`           | `Star`                     | Rating or favourite                        |
| MoreHorizontal | `MoreHorizontalIcon` | `Ellipsis`                 | More actions in a row                      |
| MoreVertical   | `MoreVerticalIcon`   | `EllipsisVertical`         | More actions in a column                   |
| Refresh        | `RefreshIcon`        | `RefreshCw`                | Refresh or reload                          |
| LogOut         | `LogOutIcon`         | `LogOut`                   | Sign out or leave                          |

## Replacing a glyph

Each icon is one package-owned module under `src/icons/<Name>.tsx`:

```tsx
export const SearchIcon = createIcon("SearchIcon", Search);
```

To replace the drawing, keep the public export and `IconProps` unchanged and swap the
glyph source, for example a local SVG component that accepts the same SVG props. The
generated manifest and every consumer import stay valid. The system may also remove an
icon declaration entirely; regenerate `design-system.json` and consumers who still
import it will see the real availability change.

## Licensing

Icons are rendered through [`lucide-react`](https://lucide.dev) (`ISC` license), a
runtime dependency of this package. PLR does not copy or redistribute SVG path data, so
the Lucide license applies to that dependency as installed by the consumer. The design
system's own layout, stroke choice, sizing, color, and optional class convention belong
to PLR under its MIT license.

## Discovery

- Live catalog: `/showcase/system-plr/icons`
- Offline catalog: `prism-ds icons [name] --cwd <consumer-root> [--json]`
- Manifest: `@prism-system/ui-system-plr/manifest` — the real availability is
  `publicApi["./icons"]`, never the shared vocabulary alone.
