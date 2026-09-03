/**
 * The widget vocabulary the CMS editor offers and the public pages render.
 *
 * Client-safe on purpose: the editor palette, the property panels and the
 * renderer all read from this one definition, so adding a widget means adding
 * one entry here plus one case in the renderer.
 */

import { EVENT } from "@/lib/constants"
import {
  defaultBlockStyle,
  defaultSectionStyle,
  normalizeBlockStyle,
  normalizeSectionStyle,
  type BlockStyle,
  type SectionStyle,
} from "@/lib/cms-style"

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "notice",
  "image",
  "button",
  "factGrid",
  "pricingTable",
  "video",
  "faq",
  "divider",
  "spacer",
  "cta",
  "imageText",
  "card",
  "stat",
  "quote",
  "feature",
  "gallery",
  "countdown",
  "bankDetails",
  "steps",
  "table",
  "contact",
  "map",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/** Which property editors a widget shows, in order. */
export type PropKind =
  | "text"
  | "textarea"
  | "richtext"
  | "select"
  | "boolean"
  | "number"
  | "image"
  | "stringList"
  | "pairList"
  | "imageList"
  | "url"

export type PropSpec = {
  key: string
  label: string
  kind: PropKind
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
  min?: number
  max?: number
}

export type BlockSpec = {
  type: BlockType
  name: string
  description: string
  /** Lucide icon name, resolved in the editor so specs stay serialisable. */
  icon: string
  defaults: Record<string, unknown>
  props: PropSpec[]
}

const ALIGN: PropSpec = {
  key: "align",
  label: "Alignment",
  kind: "select",
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "right", label: "Right" },
  ],
}

export const BLOCK_SPECS: Record<BlockType, BlockSpec> = {
  heading: {
    type: "heading",
    name: "Heading",
    description: "A section title.",
    icon: "Heading",
    defaults: { text: "New heading", level: "h2", align: "left" },
    props: [
      { key: "text", label: "Text", kind: "text" },
      {
        key: "level",
        label: "Size",
        kind: "select",
        options: [
          { value: "h1", label: "Extra large (H1)" },
          { value: "h2", label: "Large (H2)" },
          { value: "h3", label: "Medium (H3)" },
          { value: "h4", label: "Small (H4)" },
        ],
      },
      ALIGN,
    ],
  },

  paragraph: {
    type: "paragraph",
    name: "Text",
    description: "A paragraph of copy.",
    icon: "Type",
    defaults: {
      text: "Write something here.",
      align: "left",
      size: "base",
      muted: false,
    },
    props: [
      {
        key: "text",
        label: "Text",
        kind: "richtext",
        help: "**bold**, *italic* and [links](https://example.com) are supported.",
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "sm", label: "Small" },
          { value: "base", label: "Normal" },
          { value: "lg", label: "Large" },
        ],
      },
      ALIGN,
      { key: "muted", label: "Muted colour", kind: "boolean" },
    ],
  },

  list: {
    type: "list",
    name: "List",
    description: "A bulleted or numbered list.",
    icon: "List",
    defaults: { items: ["First point", "Second point"], ordered: false },
    props: [
      { key: "items", label: "Items", kind: "stringList" },
      { key: "ordered", label: "Numbered", kind: "boolean" },
    ],
  },

  notice: {
    type: "notice",
    name: "Notice",
    description: "A highlighted callout box.",
    icon: "Info",
    defaults: { text: "Something worth noticing.", tone: "info" },
    props: [
      { key: "text", label: "Text", kind: "richtext" },
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        options: [
          { value: "info", label: "Info (green)" },
          { value: "warning", label: "Warning (amber)" },
          { value: "danger", label: "Danger (red)" },
          { value: "neutral", label: "Neutral (grey)" },
        ],
      },
    ],
  },

  image: {
    type: "image",
    name: "Image",
    description: "A picture, uploaded to Cloudinary.",
    icon: "Image",
    defaults: { url: "", alt: "", rounded: true, caption: "" },
    props: [
      { key: "url", label: "Image", kind: "image" },
      { key: "alt", label: "Alt text", kind: "text", help: "Describes the image for screen readers." },
      { key: "caption", label: "Caption", kind: "text" },
      { key: "rounded", label: "Rounded corners", kind: "boolean" },
    ],
  },

  button: {
    type: "button",
    name: "Button",
    description: "A link styled as a button.",
    icon: "MousePointerClick",
    defaults: { label: "Click here", href: "/register", variant: "default", align: "left" },
    props: [
      { key: "label", label: "Label", kind: "text" },
      { key: "href", label: "Links to", kind: "url", placeholder: "/register" },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: [
          { value: "default", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Plain" },
        ],
      },
      ALIGN,
    ],
  },

  factGrid: {
    type: "factGrid",
    name: "Fact cards",
    description: "A row of label-and-value cards.",
    icon: "LayoutGrid",
    defaults: {
      items: [
        { label: "Date", value: "Friday 2nd – Sunday 4th October 2026" },
        { label: "Venue", value: "Alheri Prayer Village, Kaduna" },
      ],
      columns: 3,
    },
    props: [
      { key: "items", label: "Cards", kind: "pairList" },
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 4 },
    ],
  },

  pricingTable: {
    type: "pricingTable",
    name: "Accommodation prices",
    description: "Live prices, pulled from the accommodation records.",
    icon: "BedDouble",
    defaults: { showSoldOut: true, showDescription: true },
    props: [
      { key: "showDescription", label: "Show descriptions", kind: "boolean" },
      { key: "showSoldOut", label: "Show sold-out tiers", kind: "boolean" },
    ],
  },

  video: {
    type: "video",
    name: "Video",
    description: "An embedded YouTube or Vimeo video.",
    icon: "Video",
    defaults: { url: "", title: "Video" },
    props: [
      { key: "url", label: "Video URL", kind: "url", placeholder: "https://youtube.com/watch?v=…" },
      { key: "title", label: "Title", kind: "text" },
    ],
  },

  faq: {
    type: "faq",
    name: "FAQ",
    description: "Expandable question-and-answer pairs.",
    icon: "MessageCircleQuestion",
    defaults: {
      items: [{ label: "A question?", value: "The answer." }],
    },
    props: [{ key: "items", label: "Questions", kind: "pairList" }],
  },

  divider: {
    type: "divider",
    name: "Divider",
    description: "A horizontal rule.",
    icon: "Minus",
    defaults: {},
    props: [],
  },

  spacer: {
    type: "spacer",
    name: "Spacer",
    description: "Vertical breathing room.",
    icon: "MoveVertical",
    defaults: { height: 24 },
    props: [{ key: "height", label: "Height (px)", kind: "number", min: 4, max: 200 }],
  },

  cta: {
    type: "cta",
    name: "Call to action",
    description: "A heading, a line of copy and a button, together.",
    icon: "Megaphone",
    defaults: {
      heading: "Ready to join us?",
      text: "Registration takes about five minutes.",
      label: "Register now",
      href: "/register",
      variant: "default",
      align: "center",
    },
    props: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "text", label: "Supporting text", kind: "richtext" },
      { key: "label", label: "Button label", kind: "text" },
      { key: "href", label: "Button links to", kind: "url", placeholder: "/register" },
      {
        key: "variant",
        label: "Button style",
        kind: "select",
        options: [
          { value: "default", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Plain" },
        ],
      },
      ALIGN,
    ],
  },

  imageText: {
    type: "imageText",
    name: "Image & text",
    description: "A picture beside a block of copy.",
    icon: "Columns2",
    defaults: {
      url: "",
      alt: "",
      heading: "A heading",
      text: "Say something about the picture beside this.",
      imageSide: "left",
      rounded: true,
    },
    props: [
      { key: "url", label: "Image", kind: "image" },
      { key: "alt", label: "Alt text", kind: "text", help: "Describes the image for screen readers." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "text", label: "Text", kind: "richtext" },
      {
        key: "imageSide",
        label: "Image on the",
        kind: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
      { key: "rounded", label: "Rounded corners", kind: "boolean" },
    ],
  },

  card: {
    type: "card",
    name: "Card",
    description: "A bordered card with an optional picture and link.",
    icon: "SquareStack",
    defaults: {
      url: "",
      alt: "",
      heading: "Card title",
      text: "A sentence about it.",
      label: "",
      href: "",
    },
    props: [
      { key: "url", label: "Image", kind: "image" },
      { key: "alt", label: "Alt text", kind: "text" },
      { key: "heading", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "richtext" },
      { key: "label", label: "Link label", kind: "text", help: "Leave empty for no link." },
      { key: "href", label: "Links to", kind: "url" },
    ],
  },

  stat: {
    type: "stat",
    name: "Statistic",
    description: "One big number with a label.",
    icon: "Hash",
    defaults: { value: "500+", label: "Delegates expected", caption: "", align: "center" },
    props: [
      { key: "value", label: "Number", kind: "text" },
      { key: "label", label: "Label", kind: "text" },
      { key: "caption", label: "Caption", kind: "text" },
      ALIGN,
    ],
  },

  quote: {
    type: "quote",
    name: "Quote",
    description: "A testimonial with an attribution.",
    icon: "Quote",
    defaults: {
      text: "The retreat changed the way I pray.",
      author: "A delegate",
      role: "Kaduna, 2025",
      url: "",
    },
    props: [
      { key: "text", label: "Quote", kind: "textarea" },
      { key: "author", label: "Name", kind: "text" },
      { key: "role", label: "Description", kind: "text" },
      { key: "url", label: "Photo", kind: "image" },
    ],
  },

  feature: {
    type: "feature",
    name: "Feature",
    description: "An icon, a title and a line of copy.",
    icon: "Sparkles",
    defaults: { icon: "Star", heading: "Something good", text: "Why it matters." },
    props: [
      {
        key: "icon",
        label: "Icon",
        kind: "select",
        options: [
          { value: "Star", label: "Star" },
          { value: "Heart", label: "Heart" },
          { value: "Check", label: "Tick" },
          { value: "Sparkles", label: "Sparkles" },
          { value: "BookOpen", label: "Book" },
          { value: "Users", label: "People" },
          { value: "MapPin", label: "Location" },
          { value: "Clock", label: "Clock" },
          { value: "BedDouble", label: "Bed" },
          { value: "Utensils", label: "Food" },
          { value: "Wifi", label: "Internet" },
          { value: "ShieldCheck", label: "Shield" },
        ],
      },
      { key: "heading", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "richtext" },
    ],
  },

  gallery: {
    type: "gallery",
    name: "Gallery",
    description: "A grid of pictures.",
    icon: "Images",
    defaults: { images: [], columns: 3, rounded: true },
    props: [
      { key: "images", label: "Pictures", kind: "imageList" },
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 5 },
      { key: "rounded", label: "Rounded corners", kind: "boolean" },
    ],
  },

  countdown: {
    type: "countdown",
    name: "Countdown",
    description: "Time left until the retreat, ticking live.",
    icon: "Timer",
    defaults: { target: EVENT.startsOn, heading: "Until we gather", align: "center" },
    props: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "target",
        label: "Counts down to",
        kind: "text",
        placeholder: "2026-10-02",
        help: "A date, written as YYYY-MM-DD.",
      },
      ALIGN,
    ],
  },

  bankDetails: {
    type: "bankDetails",
    name: "Bank details",
    description: "The transfer account, with a copy button.",
    icon: "Landmark",
    defaults: { heading: "Pay by transfer", note: "" },
    props: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "note", label: "Note underneath", kind: "richtext" },
    ],
  },

  steps: {
    type: "steps",
    name: "Numbered steps",
    description: "An ordered walkthrough.",
    icon: "ListOrdered",
    defaults: {
      items: [
        { label: "Register", value: "Fill in the form and choose your accommodation." },
        { label: "Pay", value: "Transfer the total, or pay online with Paystack." },
        { label: "Arrive", value: "Bring the LFF ID we email you." },
      ],
    },
    props: [{ key: "items", label: "Steps", kind: "pairList" }],
  },

  table: {
    type: "table",
    name: "Table",
    description: "Rows of label and value.",
    icon: "Table",
    defaults: {
      caption: "",
      items: [
        { label: "Arrival", value: "Friday, 2nd October" },
        { label: "Departure", value: "Sunday, 4th October" },
      ],
    },
    props: [
      { key: "caption", label: "Caption", kind: "text" },
      { key: "items", label: "Rows", kind: "pairList" },
    ],
  },

  contact: {
    type: "contact",
    name: "Contact buttons",
    description: "Call, WhatsApp and email, as buttons.",
    icon: "PhoneCall",
    defaults: {
      heading: "Need help?",
      phone: EVENT.supportPhone,
      email: "",
      whatsapp: true,
      align: "left",
    },
    props: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "phone", label: "Phone number", kind: "text" },
      { key: "email", label: "Email address", kind: "text" },
      { key: "whatsapp", label: "Show a WhatsApp button", kind: "boolean" },
      ALIGN,
    ],
  },

  map: {
    type: "map",
    name: "Map",
    description: "An embedded Google map of the venue.",
    icon: "Map",
    defaults: { query: EVENT.venue, height: 320, caption: "" },
    props: [
      { key: "query", label: "Place", kind: "text", help: "A place name or an address." },
      { key: "height", label: "Height (px)", kind: "number", min: 160, max: 800 },
      { key: "caption", label: "Caption", kind: "text" },
    ],
  },
}

export type Block = {
  id: string
  type: BlockType
  props: Record<string, unknown>
  visible: boolean
  /** Spacing, width and per-device visibility. Optional on old records. */
  style?: BlockStyle
}

/**
 * A band of the page. Sections are what carry backgrounds and page-wide
 * padding; blocks live inside them.
 */
export type Section = {
  id: string
  name: string
  blocks: Block[]
  visible: boolean
  style?: SectionStyle
}

/** Sections of the delegate-facing site that the CMS owns. */
export const CMS_SECTIONS = [
  {
    slug: "home.hero",
    name: "Landing — hero",
    description: "The dark banner at the top of the home page.",
    onDark: true,
  },
  {
    slug: "home.body",
    name: "Landing — before you register",
    description: "The notes below the hero on the home page.",
  },
  {
    slug: "register.welcome",
    name: "Registration — step 1, Welcome",
    description: "The first screen of the registration stepper.",
  },
  {
    slug: "register.fees",
    name: "Registration — step 2, Fees",
    description: "Prices and what the fee covers.",
  },
  {
    slug: "register.feeding",
    name: "Registration — Feeding notice",
    description: "Shown above the comments box.",
  },
  {
    slug: "register.payment",
    name: "Registration — Payment notes",
    description: "Shown above the bank details on the last step.",
  },
  {
    slug: "register.submitted",
    name: "Registration — Thank you",
    description: "Shown after a delegate submits.",
  },
  {
    slug: "status.intro",
    name: "Status page — intro",
    description: "Above the lookup form on /status.",
  },
] as const

export type CmsSectionSlug = (typeof CMS_SECTIONS)[number]["slug"]

export const CMS_SECTION_SLUGS: readonly string[] = CMS_SECTIONS.map((section) => section.slug)

/** Narrows an untrusted string (a query param) to a known section. */
export function isSectionSlug(value: string): value is CmsSectionSlug {
  return CMS_SECTION_SLUGS.includes(value)
}

export function sectionMeta(slug: string) {
  return CMS_SECTIONS.find((section) => section.slug === slug) ?? null
}

function shortId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

/** A fresh block of the given type, with a client-generated id. */
export function newBlock(type: BlockType): Block {
  return {
    id: shortId("b"),
    type,
    props: structuredClone(BLOCK_SPECS[type].defaults),
    visible: true,
    style: defaultBlockStyle(),
  }
}

export function newSection(name = "New section"): Section {
  const style = defaultSectionStyle()

  return {
    id: shortId("s"),
    name,
    blocks: [],
    visible: true,
    style: {
      ...style,
      // A section with no padding reads as nothing at all — you cannot see
      // where it starts or ends. These are the proportions the hand-built
      // pages already used, so a new section matches the site out of the box.
      padding: {
        desktop: { top: 56, right: 24, bottom: 56, left: 24 },
        tablet: { top: 40, right: 24, bottom: 40, left: 24 },
        mobile: { top: 32, right: 20, bottom: 32, left: 20 },
      },
      maxWidth: 1100,
      minHeight: { desktop: 120, tablet: null, mobile: null },
    },
  }
}

/**
 * Read a stored document as sections.
 *
 * Content saved before sections existed is a flat block list, so it is wrapped
 * in one unstyled section. That keeps every existing page rendering unchanged
 * and means there is no migration to run.
 */
export function toSections(input: {
  sections?: unknown
  blocks?: unknown
}): Section[] {
  const raw = input.sections

  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((section) => {
      const value = (section ?? {}) as Partial<Section>
      return {
        id: typeof value.id === "string" ? value.id : shortId("s"),
        name: typeof value.name === "string" ? value.name : "Section",
        visible: value.visible !== false,
        style: normalizeSectionStyle(value.style),
        blocks: Array.isArray(value.blocks) ? value.blocks.map(normalizeBlock) : [],
      }
    })
  }

  const blocks = Array.isArray(input.blocks) ? input.blocks.map(normalizeBlock) : []

  return [
    {
      id: "s-main",
      name: "Section 1",
      blocks,
      visible: true,
      style: defaultSectionStyle(),
    },
  ]
}

function normalizeBlock(block: unknown): Block {
  const value = (block ?? {}) as Partial<Block>
  const type = (BLOCK_TYPES as readonly string[]).includes(value.type as string)
    ? (value.type as BlockType)
    : "paragraph"

  return {
    id: typeof value.id === "string" ? value.id : shortId("b"),
    type,
    props: (value.props ?? {}) as Record<string, unknown>,
    visible: value.visible !== false,
    style: normalizeBlockStyle(value.style),
  }
}

/** Every block across every section, for the places that only want content. */
export function flattenBlocks(sections: Section[]): Block[] {
  return sections.filter((section) => section.visible).flatMap((section) => section.blocks)
}
