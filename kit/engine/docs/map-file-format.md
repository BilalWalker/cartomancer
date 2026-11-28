# Map file format

A map is one JSON file. The engine reads it with `Engine.loadMap(text)`.
A file that does not fit this format is refused with a plain message that
names the problem. The engine never keeps a half-loaded map.

## Format version

The top-level field `formatVersion` is required and must be a whole number.
The only supported version is `1`. Any other number is refused with a message
that lists the supported versions.

## Screen_Convention

- `x` grows to the right and `y` grows down the screen.
- A heading is in degrees clockwise from the positive x axis. 0 points right,
  90 points down the screen, 180 points left and -90 points up.
- All distances are in world units.

## Top-level fields

| Field               | Type   | Required | Notes                                  |
| ------------------- | ------ | -------- | -------------------------------------- |
| `formatVersion`     | number | yes      | Whole number, must be `1`.             |
| `nodes`             | list   | yes      | See Nodes.                             |
| `roads`             | list   | yes      | See Roads.                             |
| `places`            | list   | yes      | See Places.                            |
| `blockedAreas`      | list   | yes      | See Blocked areas.                     |
| `props`             | list   | yes      | See Props.                             |
| `backgroundPicture` | object | no       | See Background picture.                |
| `style`             | object | yes      | See Style.                             |

The file itself must be an object. Every list entry must be an object. Every
`id` is a non-empty text and is unique within its own list. Fields not listed
here are ignored.

## Nodes

| Field | Type   | Rule                 |
| ----- | ------ | -------------------- |
| `id`  | text   | Non-empty, unique.   |
| `x`   | number | Finite.              |
| `y`   | number | Finite.              |

## Roads

| Field        | Type    | Rule                                                        |
| ------------ | ------- | ----------------------------------------------------------- |
| `id`         | text    | Non-empty, unique.                                          |
| `fromNodeId` | text    | Id of an existing node.                                     |
| `toNodeId`   | text    | Id of an existing node, different from `fromNodeId`.        |
| `width`      | number  | Finite and greater than 0.                                  |
| `kind`       | text    | One of `main`, `side`, `footpath`, `corridor`.              |
| `oneWay`     | boolean | Optional. When `true`, travel is allowed only from `fromNodeId` to `toNodeId`. |

A road that crosses a blocked area is not used for routes. The engine reports
it as a notice.

## Places

| Field      | Type   | Rule                          |
| ---------- | ------ | ----------------------------- |
| `id`       | text   | Non-empty, unique.            |
| `name`     | text   | Non-empty.                    |
| `category` | text   | Non-empty.                    |
| `x`        | number | Finite.                       |
| `y`        | number | Finite.                       |

## Blocked areas

| Field     | Type | Rule                                                  |
| --------- | ---- | ----------------------------------------------------- |
| `id`      | text | Non-empty, unique.                                    |
| `kind`    | text | One of `mountain`, `water`, `wall`.                   |
| `polygon` | list | Three or more points. Each point is an object with finite numbers `x` and `y`. |

## Props

Props are decoration only.

| Field             | Type   | Rule                       |
| ----------------- | ------ | -------------------------- |
| `id`              | text   | Non-empty, unique.         |
| `kind`            | text   | Non-empty.                 |
| `x`               | number | Finite.                    |
| `y`               | number | Finite.                    |
| `width`           | number | Finite and greater than 0. |
| `height`          | number | Finite and greater than 0. |
| `rotationDegrees` | number | Finite.                    |
| `blockHeight`     | number | Optional. Finite, 0 or more, in world units. |

`blockHeight` is how tall a prop stands when a view draws it as a raised
block. It is not called `height` because `width` and `height` are the
ground footprint of the prop. When it is absent, a view uses a default
for the kind: `building` 12, `house` 6, `tower` 24, `wall-block` 3, and
0 for any other kind. A file without `blockHeight` keeps its meaning.

## Background picture

Optional. When present it must be an object.

| Field     | Type   | Rule                          |
| --------- | ------ | ----------------------------- |
| `ref`     | text   | Non-empty.                    |
| `scale`   | number | Finite and greater than 0.    |
| `opacity` | number | Finite, from 0 to 1 inclusive.|

## Style

`style` is an object with two objects, `colors` and `lineStyles`. Both are
required. These are the rules the loader checks:

- `colors`: every value is a text. The key is the colour name.
- `lineStyles`: every value is an object. The key is the line style name.
  - `width` is required, a finite number greater than 0.
  - `dash` is optional. When present it is a list of finite numbers, each 0 or
    more. An empty list is allowed.

The Engine loader accepts any colour text. The Views apply the colour rule.

### Colour rule

A colour is usable when it is a text of `#rgb`, `#rrggbb` or `#rrggbbaa`
(hex digits of either case) and nothing else. When a colour in the map is not
usable, the Views use the default colour for that key and give a Notice such
as: The style colour "ground" is not a colour like #rgb, #rrggbb or #rrggbbaa,
so the default colour #f0ecdf is used.

A key the Views do not read is ignored. A key the map does not set takes its
default.

### Colour keys

| Key | Default |
| --- | --- |
| `road.main` | `#fffdf7` |
| `road.side` | `#ece6d6` |
| `road.footpath` | `#d9cfb6` |
| `road.corridor` | `#dcd3e6` |
| `roadOutline` | `#8a8272` |
| `ground` | `#f0ecdf` |
| `blockedArea.mountain` | `#9a8f7e` |
| `blockedArea.water` | `#9cc4dc` |
| `blockedArea.wall` | `#6e6a66` |
| `blockedRoad` | `#b3261e` |
| `prop` | `#b8b09c` |
| `raisedBlockTop` | `#c9c2ae` |
| `raisedBlockSide` | `#a39b86` |
| `routeLine` | `#0b4fb3` |
| `routeLineOutline` | `#06285c` |
| `playerMarker` | `#d1360f` |
| `destinationMarker` | `#7a1fa2` |
| `placeLabelText` | `#1a1a1a` |
| `placeLabelBackground` | `#ffffff` |
| `rim` | `#3a3a3a` |
| `northMark` | `#08203a` |

### Line style keys

Width is in CSS pixels. Dash is a list of lengths in CSS pixels, `none` when
there is no dash.

| Key | Default width | Default dash |
| --- | --- | --- |
| `road.main` | 1 | none |
| `road.side` | 1 | none |
| `road.footpath` | 1 | 6, 4 |
| `road.corridor` | 1 | none |
| `roadOutline` | 2 | none |
| `blockedRoad` | 2 | 8, 5 |
| `blockedAreaOutline` | 1.5 | none |
| `propOutline` | 1 | none |
| `routeLine` | 6 | none |
| `routeLineOutline` | 2 | none |
| `rim` | 3 | none |
