import { Image } from 'expo-image';

import { GarmentSilhouette } from '@/components/fitBuilder/GarmentSilhouette';

describe('GarmentSilhouette', () => {
  it('renders nothing for accessory -- no single shape represents jewelry/bags/hats/belts', () => {
    expect(GarmentSilhouette({ category: 'accessory', width: 40, height: 40, color: '#E7E5E4' })).toBeNull();
  });

  it.each(['top', 'bottom', 'outerwear', 'shoes'] as const)(
    'renders a tinted, contain-fit image for %s',
    (category) => {
      const element = GarmentSilhouette({ category, width: 40, height: 20, color: '#E7E5E4' });

      expect(element?.type).toBe(Image);
      expect(element?.props.tintColor).toBe('#E7E5E4');
      expect(element?.props.contentFit).toBe('contain');
      expect(element?.props.style).toEqual({ width: 40, height: 20, opacity: 0.5 });
      expect(element?.props.source).toBeTruthy();
    },
  );

  it('defaults to 0.5 opacity but takes an override', () => {
    const defaulted = GarmentSilhouette({ category: 'top', width: 40, height: 20, color: '#E7E5E4' });
    expect(defaulted?.props.style).toMatchObject({ opacity: 0.5 });

    const overridden = GarmentSilhouette({
      category: 'top',
      width: 40,
      height: 20,
      color: '#E7E5E4',
      opacity: 0.75,
    });
    expect(overridden?.props.style).toMatchObject({ opacity: 0.75 });
  });

  it('uses a different image source per category', () => {
    const sources = (['top', 'bottom', 'outerwear', 'shoes'] as const).map(
      (category) => GarmentSilhouette({ category, width: 40, height: 40, color: '#E7E5E4' })?.props.source,
    );
    expect(new Set(sources).size).toBe(sources.length);
  });
});
