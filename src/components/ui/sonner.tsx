import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-(--glass-bg) group-[.toaster]:text-(--text-primary) group-[.toaster]:border-(--glass-border) group-[.toaster]:shadow-2xl group-[.toaster]:backdrop-blur-xl group-[.toaster]:rounded-xl font-sans",
          description: "group-[.toast]:text-(--text-secondary)",
          actionButton:
            "group-[.toast]:bg-(--text-primary) group-[.toast]:text-(--bg-base) font-medium rounded-md",
          cancelButton:
            "group-[.toast]:bg-(--glass-bg-subtle) group-[.toast]:text-(--text-secondary) font-medium rounded-md",
          closeButton:
            "group-[.toast]:bg-(--glass-bg) group-[.toast]:text-(--text-primary) group-[.toast]:border-(--glass-border) hover:group-[.toast]:bg-(--glass-bg-subtle) transition-colors !left-auto !right-0 !translate-x-[35%] !-translate-y-[35%]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
