import { Text } from '@/components/ui/Text';

/** Uppercase, tracked-out section label -- the spec-sheet convention fashion catalog layouts use for "Category," "Color," etc. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" className="mb-2 uppercase tracking-wide text-ink-secondary dark:text-ink-secondaryDark">
      {children}
    </Text>
  );
}
