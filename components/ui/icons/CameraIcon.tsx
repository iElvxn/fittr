import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke camera -- same family/weight as CheckIcon/PlusIcon. Marks "Add a photo". */
export function CameraIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8H7.5L9 6H15L16.5 8H20V18.5H4Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.2} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}
