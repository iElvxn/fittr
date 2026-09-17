import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

export function HangerIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4a1.5 1.5 0 1 1-1.4 2"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 6v2.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path
        d="M12 8.5L4.6 13a1 1 0 0 0 .5 1.9h13.8a1 1 0 0 0 .5-1.9L12 8.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M4 18h16" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
