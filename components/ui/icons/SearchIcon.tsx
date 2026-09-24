import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke magnifier -- same family/weight as CloseIcon/PlusIcon. */
export function SearchIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.75} />
      <Path d="M16 16L20 20" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}
