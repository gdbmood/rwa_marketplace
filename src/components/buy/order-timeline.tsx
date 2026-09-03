'use client';

import { Box, CircularProgress, Typography } from '@mui/material';

export interface TimelineStep {
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed';
}

/**
 * Horizontal order status timeline for the buy flow, mirroring the order
 * state machine (created, awaiting funds, funded, submitted, settled).
 */
export default function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 2, mb: 1 }}>
      {steps.map((step, index) => (
        <Box
          key={step.label}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Box
              sx={{
                flex: 1,
                height: '2px',
                backgroundColor: index === 0 ? 'transparent' : stepColor(steps[index - 1].state),
              }}
            />
            <StepDot state={step.state} />
            <Box
              sx={{
                flex: 1,
                height: '2px',
                backgroundColor:
                  index === steps.length - 1 ? 'transparent' : stepColor(step.state, true),
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              mt: 0.75,
              textAlign: 'center',
              color:
                step.state === 'pending'
                  ? 'marketplace.filterButtonText'
                  : step.state === 'failed'
                    ? 'error.main'
                    : 'navbar.primary',
              fontWeight: step.state === 'active' ? 600 : 400,
            }}
          >
            {step.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function stepColor(state: TimelineStep['state'], trailing = false): string {
  if (state === 'done') {
    return '#C6FF00';
  }
  if (state === 'active' && !trailing) {
    return '#C6FF00';
  }
  return 'rgba(158, 158, 158, 0.4)';
}

function StepDot({ state }: { state: TimelineStep['state'] }) {
  if (state === 'active') {
    return <CircularProgress size={16} thickness={6} sx={{ color: '#C6FF00', mx: 0.5 }} />;
  }
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        mx: 0.5,
        backgroundColor:
          state === 'done' ? '#C6FF00' : state === 'failed' ? 'error.main' : 'transparent',
        border: 2,
        borderColor:
          state === 'done'
            ? '#C6FF00'
            : state === 'failed'
              ? 'error.main'
              : 'rgba(158, 158, 158, 0.6)',
      }}
    />
  );
}
