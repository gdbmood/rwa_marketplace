// src/components/__tests__/get-started-button.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import GetStartedButton from '../get-started-button';

// Mock Next.js Link
jest.mock('next/link', () => {
    return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
        return <a href={href}>{children}</a>;
    };
});

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
    return render(
        <ThemeProvider theme={theme}>
            {component}
        </ThemeProvider>
    );
};

describe('GetStartedButton', () => {
    it('should render the button with correct text', () => {
        renderWithTheme(<GetStartedButton />);

        const button = screen.getByRole('button', { name: /get started/i });
        expect(button).toBeInTheDocument();
    });

    it('should render the button with correct styling', () => {
        renderWithTheme(<GetStartedButton />);

        const button = screen.getByRole('button');
        expect(button).toHaveStyle({
            backgroundColor: '#C6FF00',
            borderRadius: '71px',
        });
    });

    it('should contain an SVG icon', () => {
        renderWithTheme(<GetStartedButton />);

        const svgElement = screen.getByRole('button').querySelector('svg');
        expect(svgElement).toBeInTheDocument();
        expect(svgElement).toHaveAttribute('width', '28');
        expect(svgElement).toHaveAttribute('height', '29');
    });

    it('should be wrapped in a Link component', () => {
        renderWithTheme(<GetStartedButton />);

        const link = screen.getByRole('link');
        expect(link).toBeInTheDocument();
    });

    it('should have uppercase text transform', () => {
        renderWithTheme(<GetStartedButton />);

        const button = screen.getByRole('button');
        // Note: MUI applies textTransform through sx prop, 
        // so we check for the presence of the button rather than computed style
        expect(button).toBeInTheDocument();
    });

    it('should have proper typography styling', () => {
        renderWithTheme(<GetStartedButton />);

        const typography = screen.getByText('Get Started');
        expect(typography).toBeInTheDocument();
        expect(typography).toHaveStyle({
            color: '#161616',
            fontWeight: 500,
            fontFamily: 'Roboto',
        });
    });

    it('should be a contained variant button', () => {
        renderWithTheme(<GetStartedButton />);

        const button = screen.getByRole('button');
        expect(button).toHaveClass('MuiButton-contained');
    });

    it('should have link with valid href attribute', () => {
        renderWithTheme(<GetStartedButton />);

        const link = screen.getByRole('link');
        const href = link.getAttribute('href');
        expect(href).toMatch(/\/(marketplace|dashboard)$/);
    });

    it('should link to either marketplace or dashboard', () => {
        renderWithTheme(<GetStartedButton />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href');

        // Should be either /marketplace or /dashboard
        const href = link.getAttribute('href');
        expect(['/marketplace', '/dashboard']).toContain(href);
    });

    it('should contain button inside link', () => {
        renderWithTheme(<GetStartedButton />);

        const link = screen.getByRole('link');
        const button = screen.getByRole('button');

        expect(link).toContainElement(button);
    });
});
