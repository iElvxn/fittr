import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

export function PersonIcon({ size = 22, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20c1.4-4.2 4.4-6.5 7.5-6.5s6.1 2.3 7.5 6.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
