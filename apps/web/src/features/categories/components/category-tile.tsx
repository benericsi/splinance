import { BRAND_COLORS, type Category, type CategoryIcon, readableTextOn } from '@splinance/shared';
import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Droplet,
  Dumbbell,
  Film,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  type LucideIcon,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Every allowed icon name maps to a component; the Record type makes a missing one a type error. */
export const CATEGORY_ICON_COMPONENTS: Record<CategoryIcon, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  house: House,
  zap: Zap,
  droplet: Droplet,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  car: Car,
  fuel: Fuel,
  plane: Plane,
  'heart-pulse': HeartPulse,
  pill: Pill,
  shirt: Shirt,
  film: Film,
  music: Music,
  'gamepad-2': Gamepad2,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  baby: Baby,
  'paw-print': PawPrint,
  gift: Gift,
  dumbbell: Dumbbell,
  scissors: Scissors,
  wrench: Wrench,
  shield: Shield,
  receipt: Receipt,
  'piggy-bank': PiggyBank,
  briefcase: Briefcase,
  banknote: Banknote,
  'hand-coins': HandCoins,
  tag: Tag,
};

/**
 * The category's icon on its brand color (a fill), with black or white for the icon,
 * whichever contrasts more. Without a category: a neutral tile with a receipt.
 */
export function CategoryTile({
  category,
  size = 'md',
  className,
}: {
  category: Pick<Category, 'icon' | 'color'> | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = category ? CATEGORY_ICON_COMPONENTS[category.icon] : Receipt;
  const background = category ? BRAND_COLORS[category.color] : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        size === 'md' ? 'size-9 [&_svg]:size-[18px]' : 'size-6 rounded-md [&_svg]:size-3.5',
        !category && 'bg-muted text-muted-foreground',
        className,
      )}
      style={background ? { backgroundColor: background, color: readableTextOn(background) } : {}}
    >
      <Icon />
    </span>
  );
}
