import type { TourDefinition } from '../types';

export const dashboardWelcomeTour: TourDefinition = {
	id: 'dashboard-welcome',
	name: 'Welcome to QDesigner',
	description: 'A quick overview of your dashboard and key features.',
	autoTrigger: true,
	triggerKey: 'qd-tour:dashboard-welcome',
	steps: [
		{
			id: 'welcome',
			target: '[data-tour="dashboard-overview"]',
			title: 'Welcome to QDesigner',
			description:
				'This is your dashboard -- the central hub for all your questionnaires, responses, and activity. Let us take a quick tour of the key areas.',
			placement: 'bottom',
		},
		{
			id: 'questionnaires',
			target: '[data-tour="dashboard-questionnaires"]',
			title: 'Your Questionnaires',
			description:
				'All your questionnaires appear here with live stats: response counts, completion rates, and 7-day trend sparklines. Click any card to open it in the designer.',
			placement: 'right',
		},
		{
			id: 'new-questionnaire',
			target: '[data-tour="new-questionnaire"]',
			title: 'Create Your First Questionnaire',
			description:
				"Click **New Questionnaire** to start building. You'll choose a project first, then land in the visual designer where you can add questions, variables, and flow control.",
			placement: 'bottom',
		},
		{
			id: 'projects-nav',
			target: 'a[data-nav="projects"]',
			title: 'Organize with Projects',
			description:
				'Projects group related questionnaires together. Each project can have its own team members and analytics. Navigate here to manage your projects.',
			placement: 'bottom',
		},
		{
			id: 'admin-nav',
			target: 'a[data-nav="admin"]',
			title: 'Admin & Settings',
			description:
				'Manage your organization, team members, domains, and invitations from the Admin panel. You can also access your personal settings from the user menu.',
			placement: 'bottom',
		},
	],
};
