import React, { FC } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  Focus,
  Folder,
  Globe,
  GripVertical,
  Image,
  Info,
  Languages,
  Link,
  LoaderCircle,
  LogIn,
  Pencil,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import "./Icon.css";

// Единственный вход к иконкам рендерера (редизайн R1): lucide, линия 2 px, SVG прямо в DOM,
// из сети ничего не грузится. Цвет — currentColor, его задаёт CSS кнопки или текста вокруг.
export type IconName =
  | "users" | "link" | "globe" | "languages" | "search" | "plus" | "sliders" | "refresh" | "folder"
  | "copy" | "shieldCheck" | "logIn" | "file" | "pencil" | "trash" | "play" | "square" | "focus"
  | "user" | "download" | "upload" | "eye" | "eyeOff" | "archive" | "chevronLeft" | "chevronRight"
  | "chevronsLeft" | "chevronsRight" | "chevronDown" | "chevronUp" | "check" | "x" | "alert" | "info"
  | "loader" | "puzzle" | "image" | "grip"
  // Сверх списка плана: у старых иконок «проверить прокси», «вопрос» и «вернуть из архива»
  // в нём нет пары.
  | "activity" | "help" | "archiveRestore"
  // Тип подтверждения на плитке (SellItem): обмен и лот на рынке.
  | "arrowLeftRight" | "tag";

export type IconSize = 13 | 14 | 16 | 18 | 20;

/** pop — подпрыгивает при наведении, spin — пол-оборота при наведении, spinAlways — крутится всегда. */
export type IconMotion = "pop" | "spin" | "spinAlways" | "none";

const ICONS: Record<IconName, LucideIcon> = {
  users: Users,
  link: Link,
  globe: Globe,
  languages: Languages,
  search: Search,
  plus: Plus,
  sliders: SlidersHorizontal,
  refresh: RefreshCw,
  folder: Folder,
  copy: Copy,
  shieldCheck: ShieldCheck,
  logIn: LogIn,
  file: File,
  pencil: Pencil,
  trash: Trash2,
  play: Play,
  square: Square,
  focus: Focus,
  user: User,
  download: Download,
  upload: Upload,
  eye: Eye,
  eyeOff: EyeOff,
  archive: Archive,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsLeft: ChevronsLeft,
  chevronsRight: ChevronsRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  check: Check,
  x: X,
  alert: TriangleAlert,
  info: Info,
  loader: LoaderCircle,
  puzzle: Puzzle,
  image: Image,
  grip: GripVertical,
  activity: Activity,
  help: CircleHelp,
  archiveRestore: ArchiveRestore,
  arrowLeftRight: ArrowLeftRight,
  tag: Tag,
};

// Классы анимаций из src/css/motion.css. Ховер-анимации срабатывают и при наведении на кнопку,
// ссылку или [role=button], внутри которой лежит иконка, а не только на сам маленький svg.
const MOTION_CLASS: Record<IconMotion, string> = {
  pop: "sda-anim-pop",
  spin: "sda-anim-spin",
  spinAlways: "sda-spin",
  none: "",
};

/**
 * Иконка lucide. Без title она декоративная (aria-hidden): имя для скринридера несёт кнопка
 * вокруг. С title — самостоятельная картинка с этим именем.
 */
export const Icon: FC<{ name: IconName; size?: IconSize; motion?: IconMotion; className?: string; title?: string }> = ({
  name,
  size = 16,
  motion = "none",
  className,
  title,
}) => {
  const Component = ICONS[name];
  const classes = ["sda-icon", MOTION_CLASS[motion], className].filter(Boolean).join(" ");
  if (title) {
    return (
      <Component size={size} strokeWidth={2} className={classes} role="img" aria-label={title}>
        <title>{title}</title>
      </Component>
    );
  }
  return <Component size={size} strokeWidth={2} className={classes} aria-hidden="true" />;
};

export default Icon;
