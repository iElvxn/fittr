import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
  filled?: boolean;
};

/**
 * DESIGN.md's favorite-indicator: outline when inactive, solid fill when
 * active -- state is shown by fill, never by a color change. Same
 * thin-stroke path family/weight as PencilIcon/CheckIcon.
 */
export function HeartIcon({ size = 20, color, filled = false }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.25C12 20.25 3.75 15.75 3.75 9.75C3.75 7.26472 5.76472 5.25 8.25 5.25C9.79217 5.25 11.1521 6.02202 12 7.20455C12.8479 6.02202 14.2078 5.25 15.75 5.25C18.2353 5.25 20.25 7.26472 20.25 9.75C20.25 15.75 12 20.25 12 20.25Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}
