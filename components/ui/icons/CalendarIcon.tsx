import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

export function CalendarIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 9.5h18" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M8 3v3M16 3v3" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
