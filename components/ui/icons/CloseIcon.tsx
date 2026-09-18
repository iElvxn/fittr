import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke "X" -- same family/weight as ChevronLeftIcon/PlusIcon. */
export function CloseIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}
