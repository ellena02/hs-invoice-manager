# Invoice Manager - HubSpot CRM Extension Design Guidelines

## Design Approach

**Selected System**: HubSpot Canvas Design System
**Rationale**: This is a private CRM extension living within HubSpot's ecosystem. Following Canvas ensures visual consistency with the platform, familiar UX patterns for HubSpot users, and seamless integration with native CRM components.

**Core Principles**:
- Clarity and efficiency over visual flourish
- Information hierarchy that guides user actions
- Consistent spacing creating visual breathing room
- Professional presentation suitable for business contexts

---

## Typography Hierarchy

**Font Stack**: System fonts via HubSpot UI Extensions default
- **Card Title**: Bold, larger size (equivalent to text-lg or 18px)
- **Section Headers**: Bold, standard size ("Associated Deals", "Associated Invoices")
- **Toggle Label**: Regular weight, standard size
- **Status Text**: Regular weight, smaller size ("Updating...")
- **Table Content**: Regular weight, standard size with proper contrast

**Hierarchy Rules**:
- Main card title most prominent
- Section headers create clear content divisions
- Interactive element labels clear and scannable
- Loading/status messages subtle but noticeable

---

## Layout System

**Spacing Primitives**: Tailwind units of **2, 4, and 6**
- Component gaps: `gap-4` (16px) between major sections
- Inline element gaps: `gap-2` (8px) for toggle and loading text
- Section padding: `p-4` or `p-6` for card container
- Vertical rhythm: `mb-4` between sections

**Container Structure**:
- Full-width tab content (no artificial constraints)
- Vertical stack layout with consistent spacing
- Natural height based on content (no viewport forcing)

---

## Component Library

### Core Components

**Toggle Control**:
- Positioned inline with label in horizontal flex container
- Loading indicator appears immediately adjacent (gap-2)
- Visual prominence as primary action element

**Alert Banners** (Error/Success):
- Full-width within card container
- Positioned immediately below toggle control
- Clear visual distinction for error vs success states
- Dismissible or auto-hide after action completion

**Data Tables** (CrmAssociationTable):
- Full-width within sections
- Searchable headers for user filtering
- Pagination controls at table bottom
- 10 items per page for scannable data chunks
- Column headers clearly labeled

**Dividers**:
- Horizontal rules between major sections
- Subtle visual separation without heavy weight
- Consistent spacing above and below (py-4)

### Layout Structure

```
┌─────────────────────────────────────┐
│ Invoice Manager (Title)             │
├─────────────────────────────────────┤
│ [Toggle] Mark invoices as bad debt  │
│ [Updating...] (if loading)          │
│ [Alert: Success/Error] (if shown)   │
├─────────────────────────────────────┤
│ Associated Deals (Header)           │
│ ┌─────────────────────────────────┐ │
│ │ Deal Name | Amount | Stage | ... │ │
│ │ [Searchable, Paginated Table]    │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Associated Invoices (Header)        │
│ ┌─────────────────────────────────┐ │
│ │ Invoice # | Status | Amount      │ │
│ │ [Searchable, Paginated Table]    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## Interaction Patterns

**Toggle Behavior**:
- Immediate optimistic UI update
- Loading indicator during backend call
- Success confirmation via subtle alert
- Error handling with actionable message and state rollback option

**Table Interactions**:
- Search filters update results in real-time
- Pagination controls at bottom right
- Sortable columns where applicable
- Row hover states for scannability

**State Management**:
- Loading states clearly communicated
- Error messages specific and actionable
- Success confirmations brief and unobtrusive
- No distracting animations or transitions

---

## Accessibility Standards

- All interactive elements keyboard navigable
- Toggle has clear focus states
- Alert messages announced to screen readers
- Table headers properly associated with data cells
- Sufficient contrast ratios throughout
- Error messages descriptive and helpful

---

## Implementation Notes

- Use HubSpot UI Extensions components exclusively
- Maintain consistent spacing with Tailwind primitives
- No custom styling that conflicts with Canvas design
- Responsive behavior handled by HubSpot framework
- Focus on data clarity and action efficiency