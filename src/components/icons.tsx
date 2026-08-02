import type { SVGProps } from 'react';

/** 20px stroke icons on a shared grid. `currentColor` throughout so they
 *  inherit whatever text token their container uses. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="2.5" y="2.5" width="6" height="7.5" rx="1.5" />
    <rect x="11.5" y="2.5" width="6" height="4.5" rx="1.5" />
    <rect x="2.5" y="13" width="6" height="4.5" rx="1.5" />
    <rect x="11.5" y="10" width="6" height="7.5" rx="1.5" />
  </Icon>
);

export const IconIncome = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M10 16.5V3.5" />
    <path d="M5.5 8 10 3.5 14.5 8" />
  </Icon>
);

export const IconExpenses = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M10 3.5v13" />
    <path d="M14.5 12 10 16.5 5.5 12" />
  </Icon>
);

export const IconShared = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="7" cy="7" r="2.75" />
    <circle cx="13.5" cy="8.5" r="2.25" />
    <path d="M2.5 16.5c0-2.5 2-4.25 4.5-4.25s4.5 1.75 4.5 4.25" />
    <path d="M13 12.4c2.2.15 4.5 1.5 4.5 4.1" />
  </Icon>
);

export const IconDebt = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="2.5" y="5" width="15" height="10" rx="2" />
    <path d="M2.5 8.5h15" />
    <path d="M5.5 12h3" />
  </Icon>
);

export const IconChecklist = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M3 5.5 4.5 7 7.5 4" />
    <path d="M3 12.5 4.5 14 7.5 11" />
    <path d="M10.5 5.5h6.5" />
    <path d="M10.5 12.5h6.5" />
  </Icon>
);

export const IconSettings = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7" />
  </Icon>
);

export const IconPlus = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

export const IconWarning = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M10 3.2 2.8 16h14.4L10 3.2Z" />
    <path d="M10 8v3.4" />
    <circle cx="10" cy="13.8" r=".6" fill="currentColor" />
  </Icon>
);

export const IconCheck = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 10.5 8 14.5 16 5.5" />
  </Icon>
);

export const IconSun = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.7 4.3l-1.1 1.1M5.4 14.6l-1.1 1.1M15.7 15.7l-1.1-1.1M5.4 5.4 4.3 4.3" />
  </Icon>
);

export const IconMoon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M16 11.6A6.6 6.6 0 0 1 8.4 4a6.8 6.8 0 1 0 7.6 7.6Z" />
  </Icon>
);
