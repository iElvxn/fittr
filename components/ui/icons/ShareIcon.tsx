import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** iOS-convention share glyph (open box + up-arrow) -- same thin-stroke family/weight as HeartIcon/PencilIcon. */
export function ShareIcon({ size = 20, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.75V14.25" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <Path d="M8.25 7.5L12 3.75L15.75 7.5" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M8.25 10.5H6.75C5.92157 10.5 5.25 11.1716 5.25 12V19.5C5.25 20.3284 5.92157 21 6.75 21H17.25C18.0784 21 18.75 20.3284 18.75 19.5V12C18.75 11.1716 18.0784 10.5 17.25 10.5H15.75"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
