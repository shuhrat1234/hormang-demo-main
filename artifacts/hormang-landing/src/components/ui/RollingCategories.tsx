import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CategoryIcon } from "@/components/category-icon";

export interface RollingCategoryItem {
  categoryId?: string | null;
  name: string;
  emoji?: string | null;
}

interface Props {
  items: RollingCategoryItem[];
  interval?: number;
  onClick?: (item: RollingCategoryItem) => void;
}

export function RollingCategories({ items, interval = 3000, onClick }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !items || items.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, interval);
    return () => clearInterval(timer);
  }, [items?.length, interval, paused]);

  if (!items || items.length === 0) return null;

  const current = items[index % items.length] ?? items[0];
  if (!current) return null;

  return (
    <div
      className="relative h-[48px] w-[56px] overflow-hidden flex flex-col items-center justify-center cursor-pointer flex-shrink-0"
      onClick={() => onClick?.(current)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={index}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ duration: 0.38, ease: "easeInOut" }}
          className="absolute flex flex-col items-center gap-0.5"
        >
          <CategoryIcon
            categoryId={current.categoryId}
            emoji={current.emoji}
            size={28}
            shape="square"
          />
          <span className="text-[9px] font-semibold text-blue-600 whitespace-nowrap leading-tight max-w-[56px] truncate text-center">
            {current.name}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

