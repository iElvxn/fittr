import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Used for "Fits" -- an outfit/look, distinct from Wardrobe's hanger (storage). */
export function ShirtIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 4L4 7v3h2v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9h2V7l-4-3-2 2h-4L8 4Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
