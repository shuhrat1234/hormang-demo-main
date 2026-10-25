import * as React from "react";
import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/contexts/theme-context";
import "sonner/dist/styles.css";

type SonnerProps = React.ComponentProps<typeof SonnerToaster>;

export function Toaster({ ...props }: SonnerProps) {
  let resolvedTheme: "light" | "dark" = "light";

  try {
    const themeContext = useTheme();
    resolvedTheme = themeContext.resolved;
  } catch {
    // Fallback if rendered outside ThemeProvider
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      resolvedTheme = "dark";
    }
  }

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="top-center"
      richColors
      closeButton
      duration={3500}
      offset="16px"
      mobileOffset={{ top: 16, left: 16, right: 16 }}
      className="toaster group font-sans"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background/95 group-[.toaster]:backdrop-blur-md group-[.toaster]:text-foreground group-[.toaster]:border-border/80 group-[.toaster]:shadow-xl group-[.toaster]:rounded-2xl group-[.toaster]:text-sm group-[.toaster]:font-medium",
          title: "group-[.toast]:font-semibold group-[.toast]:text-foreground",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 active:scale-95 transition-transform",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-xl group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 active:scale-95 transition-transform",
          closeButton:
            "group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground group-[.toast]:border-border/60",
        },
      }}
      {...props}
    />
  );
}
