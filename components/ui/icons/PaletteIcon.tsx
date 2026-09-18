import Svg, { Circle } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Three overlapping rings -- same thin-stroke family as TrashIcon/PlusIcon, standing in for a set of color swatches. */
export function PaletteIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="9" r="5.25" stroke={color} strokeWidth={1.75} />
      <Circle cx="15" cy="9" r="5.25" stroke={color} strokeWidth={1.75} />
      <Circle cx="12" cy="15" r="5.25" stroke={color} strokeWidth={1.75} />
    </Svg>
  );
}
