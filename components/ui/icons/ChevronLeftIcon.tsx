import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke back chevron -- DESIGN.md calls for one icon family at a single stroke weight, not a platform glyph. */
export function ChevronLeftIcon({ size = 20, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5L8 12L15 19"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
