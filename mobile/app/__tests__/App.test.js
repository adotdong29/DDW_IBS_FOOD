import { StyleSheet } from 'react-native';
import { styles } from '../App';

// Logo background color - this is the exact color from the new_logo.png background
// All app backgrounds should match this value
const LOGO_BACKGROUND_COLOR = "#f3f3f4";

describe('App Background Colors Match Logo', () => {
  it('container background should match logo background color', () => {
    const flattenedContainerStyle = StyleSheet.flatten(styles.container);
    expect(flattenedContainerStyle.backgroundColor).toBe(LOGO_BACKGROUND_COLOR);
  });

  it('topBar background should match logo background color', () => {
    const flattenedTopBarStyle = StyleSheet.flatten(styles.topBar);
    expect(flattenedTopBarStyle.backgroundColor).toBe(LOGO_BACKGROUND_COLOR);
  });

  it('activeConditionsSection background should match logo background color', () => {
    const flattenedActiveConditionsStyle = StyleSheet.flatten(styles.activeConditionsSection);
    expect(flattenedActiveConditionsStyle.backgroundColor).toBe(LOGO_BACKGROUND_COLOR);
  });

  it('all background colors should be identical to each other and to logo', () => {
    const containerBg = StyleSheet.flatten(styles.container).backgroundColor;
    const topBarBg = StyleSheet.flatten(styles.topBar).backgroundColor;
    const activeConditionsBg = StyleSheet.flatten(styles.activeConditionsSection).backgroundColor;

    // All should match each other
    expect(containerBg).toBe(topBarBg);
    expect(topBarBg).toBe(activeConditionsBg);

    // All should match the logo background color
    expect(containerBg).toBe(LOGO_BACKGROUND_COLOR);
  });
});
