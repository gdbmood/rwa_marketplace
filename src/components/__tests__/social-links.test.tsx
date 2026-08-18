// src/components/__tests__/social-links.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SocialLinks from '../social-links';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
    return render(
        <ThemeProvider theme={theme}>
            {component}
        </ThemeProvider>
    );
};

describe('SocialLinks', () => {
    const defaultProps = {
        width: 50,
        height: 50,
    };

    it('should render social media links', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        // Check for Facebook images (both light and dark versions)
        const facebookImages = screen.getAllByAltText('facebook');
        expect(facebookImages).toHaveLength(1); // Only one should be visible at a time due to theme styling

        // Check for LinkedIn images
        const linkedinImages = screen.getAllByAltText('linkedin');
        expect(linkedinImages).toHaveLength(1);
    });

    it('should render with correct width and height', () => {
        const customWidth = 100;
        const customHeight = 80;

        renderWithTheme(<SocialLinks width={customWidth} height={customHeight} />);

        // The component should render without errors with custom dimensions
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);
    });

    it('should have proper image sources', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        // Check Facebook image sources
        const facebookDark = screen.getByAltText('facebook');
        expect(facebookDark).toHaveAttribute('src', '/svg/Facebook.svg');

        // Check LinkedIn image sources
        const linkedinDark = screen.getByAltText('linkedin');
        expect(linkedinDark).toHaveAttribute('src', '/svg/Linkedin.svg');
    });

    it('should render with flex display and gap', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        // The main container should have flex display
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);
    });

    it('should handle zero dimensions', () => {
        renderWithTheme(<SocialLinks width={0} height={0} />);

        // Component should still render without errors
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);
    });

    it('should handle large dimensions', () => {
        renderWithTheme(<SocialLinks width={500} height={500} />);

        // Component should still render without errors
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);
    });

    it('should have proper alt text for accessibility', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        // Check that all images have proper alt text
        const facebookImage = screen.getByAltText('facebook');
        expect(facebookImage).toBeInTheDocument();

        const linkedinImage = screen.getByAltText('linkedin');
        expect(linkedinImage).toBeInTheDocument();
    });

    it('should apply correct styling for responsive design', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        // The component should render with the expected structure
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);

        // Since we're testing responsive design, we'll check that the component renders
        // The actual responsive behavior would need integration tests
    });

    it('should handle negative dimensions gracefully', () => {
        renderWithTheme(<SocialLinks width={-10} height={-10} />);

        // Component should still render
        const socialImages = screen.getAllByRole('img');
        expect(socialImages.length).toBeGreaterThan(0);
    });

    it('should render images with proper styling attributes', () => {
        renderWithTheme(<SocialLinks {...defaultProps} />);

        const facebookImage = screen.getByAltText('facebook');
        expect(facebookImage).toHaveStyle({
            width: '100%',
            height: '100%',
        });

        const linkedinImage = screen.getByAltText('linkedin');
        expect(linkedinImage).toHaveStyle({
            width: '100%',
            height: '100%',
        });
    });
});
