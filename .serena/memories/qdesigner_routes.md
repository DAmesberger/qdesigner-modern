# QDesigner Routes

## Main Routes
- Dashboard: `/dashboard`
- Projects: `/projects`
- Project Detail: `/projects/[projectId]`
- Designer: `/projects/[projectId]/designer/[questionnaireId]`
- Admin: `/admin`
- Login: `/login`

## Navigation Flow
1. Dashboard shows overview of questionnaires
2. Projects page lists all projects
3. Click on a project to see its questionnaires
4. Click "New Questionnaire" button to create new
5. Click on existing questionnaire to open in designer

## Test Mode
Enable test mode for auto-login:
```javascript
window.testMode.enable()
```
Then navigate to `/dashboard` to auto-login as demo@example.com