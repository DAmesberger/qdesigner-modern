/**
 * Example Usage of the Collaboration System
 * This file demonstrates how to use the collaboration modules
 */

import {
  initializeCollaboration,
  createMockUser,
  type CollaborationUser,
  type Operation,
  type Comment,
  type Version
} from './index.js';
import type { Questionnaire } from '$lib/shared';

// ============================================================================
// Example Setup
// ============================================================================

// Initialize collaboration system
const collaboration = initializeCollaboration({
  websocketUrl: 'ws://localhost:8080/collaboration',
  enableComments: true,
  enablePresence: true,
  enableVersionControl: true
});

// Create example users
const users: CollaborationUser[] = [
  createMockUser('user1', 'Alice Johnson', 'alice@example.com', 'owner'),
  createMockUser('user2', 'Bob Smith', 'bob@example.com', 'editor'),
  createMockUser('user3', 'Carol Davis', 'carol@example.com', 'viewer')
];

// Example questionnaire
const exampleQuestionnaire: Questionnaire = {
  id: 'questionnaire-123',
  name: 'Example Survey',
  description: 'A sample questionnaire for collaboration demo',
  version: '1.0.0',
  created: new Date(),
  modified: new Date(),
  organizationId: 'org-456',
  projectId: 'project-789',
  variables: [],
  questions: [
    {
      id: 'q1',
      type: 'text-input',
      order: 0,
      required: true,
      display: {
        prompt: 'What is your name?',
        placeholder: 'Enter your full name'
      },
      response: {
        saveAs: 'participant_name'
      }
    } as any
  ],
  pages: [
    {
      id: 'page1',
      name: 'Introduction',
      questions: ['q1']
    }
  ],
  flow: [],
  settings: {
    allowBackNavigation: true,
    showProgressBar: true
  }
};

// ============================================================================
// Example 1: Basic Collaboration Setup
// ============================================================================

export async function exampleBasicSetup() {
  console.log('🚀 Starting collaboration example...');

  try {
    // Connect to collaboration server
    await collaboration.client.connect();
    console.log('✅ Connected to collaboration server');

    // Join a collaboration session
    const session = await collaboration.client.joinSession(
      exampleQuestionnaire.id,
      users[0] // Alice as the first user
    );
    console.log('✅ Joined collaboration session:', session.id);

    // Initialize version control
    const initialVersion = collaboration.versionControl.initializeQuestionnaire(
      exampleQuestionnaire,
      users[0].id
    );
    console.log('✅ Created initial version:', initialVersion.version);

  } catch (error) {
    console.error('❌ Failed to setup collaboration:', error);
  }
}

// ============================================================================
// Example 2: Operational Transformation
// ============================================================================

export function exampleOperationalTransform() {
  console.log('🔄 Demonstrating Operational Transformation...');

  // Create two concurrent operations
  const operation1: Operation = {
    id: 'op1',
    type: 'update',
    userId: users[0].id,
    timestamp: new Date(),
    path: ['questions', '0', 'display', 'prompt'],
    property: 'prompt',
    oldValue: 'What is your name?',
    newValue: 'What is your full name?'
  } as any;

  const operation2: Operation = {
    id: 'op2',
    type: 'update',
    userId: users[1].id,
    timestamp: new Date(Date.now() + 100), // Slightly later
    path: ['questions', '0', 'display', 'prompt'],
    property: 'prompt',
    oldValue: 'What is your name?',
    newValue: 'Please enter your name:'
  } as any;

  // Transform operations
  const result = collaboration.ot.transform(operation1, operation2);
  
  console.log('Original Operation 1:', operation1.newValue);
  console.log('Original Operation 2:', operation2.newValue);
  console.log('Transformed Operation:', result.operation);
  console.log('Has Conflicts:', !!result.conflicts);

  if (result.conflicts) {
    console.log('Conflicts detected:', result.conflicts.map(c => c.description));
  }
}

// ============================================================================
// Example 3: Version Control
// ============================================================================

export function exampleVersionControl() {
  console.log('📋 Demonstrating Version Control...');

  // Create some example operations
  const operations: Operation[] = [
    {
      id: 'op1',
      type: 'insert',
      userId: users[0].id,
      timestamp: new Date(),
      path: ['questions'],
      position: 1,
      content: {
        id: 'q2',
        type: 'single-choice',
        display: { prompt: 'What is your age group?' }
      },
      target: 'question'
    } as any,
    {
      id: 'op2',
      type: 'update',
      userId: users[0].id,
      timestamp: new Date(),
      path: ['settings'],
      property: 'showProgressBar',
      oldValue: true,
      newValue: false
    } as any
  ];

  // Create a new version
  const newVersion = collaboration.versionControl.createVersion(
    exampleQuestionnaire.id,
    exampleQuestionnaire,
    operations,
    users[0].id,
    'Added age group question and updated settings'
  );

  console.log('✅ Created version:', newVersion.version);
  console.log('📝 Version message:', newVersion.message);
  console.log('🔧 Operations count:', newVersion.operations.length);

  // Create a branch
  const branch = collaboration.versionControl.createBranch(
    exampleQuestionnaire.id,
    'feature/demographics',
    newVersion.id,
    users[1].id,
    'Adding demographic questions'
  );

  if (branch) {
    console.log('🌿 Created branch:', branch.name);
  }

  // Get version history
  const history = collaboration.versionControl.getVersionHistory(exampleQuestionnaire.id);
  console.log('📚 Version history:', {
    versions: history.versions.length,
    branches: history.branches.length,
    currentBranch: history.currentBranch
  });
}

// ============================================================================
// Example 4: Change Tracking
// ============================================================================

export function exampleChangeTracking() {
  console.log('📊 Demonstrating Change Tracking...');

  // Record some changes
  const operation: Operation = {
    id: 'op1',
    type: 'update',
    userId: users[0].id,
    timestamp: new Date(),
    path: ['questions', '0', 'display', 'prompt'],
    property: 'prompt',
    oldValue: 'What is your name?',
    newValue: 'What is your full name?'
  } as any;

  const changeRecord = collaboration.changeTracker.recordChange(
    exampleQuestionnaire.id,
    'session-123',
    operation,
    users[0],
    1
  );

  console.log('✅ Recorded change:', changeRecord.id);
  console.log('📝 Change description:', changeRecord.description);
  console.log('🏷️ Change category:', changeRecord.category);
  console.log('⚡ Change impact:', changeRecord.impact);

  // Record some activities
  collaboration.changeTracker.recordCommentActivity(
    exampleQuestionnaire.id,
    users[1],
    'created',
    'comment-123',
    'This question might be confusing for some users',
    'q1'
  );

  collaboration.changeTracker.recordVersionActivity(
    exampleQuestionnaire.id,
    users[0],
    'created',
    'version-456',
    'Added demographic questions'
  );

  // Get recent activities
  const recentActivities = collaboration.changeTracker.getRecentActivities(
    exampleQuestionnaire.id,
    24, // last 24 hours
    10  // limit to 10 items
  );

  console.log('📈 Recent activities:', recentActivities.length);
  recentActivities.forEach(activity => {
    console.log(`  ${activity.type}: ${activity.title} by ${activity.user.name}`);
  });

  // Get change statistics
  const stats = collaboration.changeTracker.getChangeStatistics(
    exampleQuestionnaire.id,
    {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
    }
  );

  console.log('📊 Change statistics:', {
    total: stats.totalChanges,
    byCategory: stats.changesByCategory,
    byImpact: stats.changesByImpact,
    mostActive: stats.mostActiveUsers[0]?.userName
  });
}

// ============================================================================
// Example 5: Real-time Events
// ============================================================================

export function exampleRealtimeEvents() {
  console.log('⚡ Setting up real-time event handlers...');

  // Listen for operations
  collaboration.client.on('operation:received', ({ operation, transformed }) => {
    console.log('📥 Received operation:', operation.type, 'transformed:', transformed);
  });

  // Listen for cursor updates
  collaboration.client.on('cursor:updated', ({ userId, position }) => {
    const user = users.find(u => u.id === userId);
    console.log('👆 Cursor update from', user?.name, 'at', position.coordinates);
  });

  // Listen for comments
  collaboration.client.on('comment:created', ({ comment }) => {
    console.log('💬 New comment from', comment.author.name + ':', comment.content);
  });

  // Listen for presence updates
  collaboration.client.on('presence:updated', ({ userId, presence }) => {
    const user = users.find(u => u.id === userId);
    console.log('👤 Presence update from', user?.name, 'status:', presence.status);
  });

  // Listen for connection status
  collaboration.client.on('connection:status', ({ status }) => {
    console.log('🔌 Connection status:', status.status);
  });

  console.log('✅ Event handlers registered');
}

// ============================================================================
// Example 6: Comments System
// ============================================================================

export async function exampleCommentsSystem() {
  console.log('💬 Demonstrating Comments System...');

  try {
    // Create a comment
    const comment: Omit<Comment, 'id' | 'author' | 'createdAt'> = {
      questionnaireId: exampleQuestionnaire.id,
      sessionId: 'session-123',
      content: 'This question might be confusing. Should we rephrase it?',
      mentions: [users[0].id], // Mention Alice
      position: {
        type: 'question',
        targetId: 'q1',
        property: 'display.prompt'
      },
      isResolved: false
    };

    await collaboration.client.createComment(comment);
    console.log('✅ Created comment');

    // Update a comment
    await collaboration.client.updateComment(
      'comment-123',
      'This question might be confusing. Should we make it clearer? @[Alice](user1)'
    );
    console.log('✅ Updated comment');

    // Resolve a comment
    await collaboration.client.resolveComment('comment-123');
    console.log('✅ Resolved comment');

  } catch (error) {
    console.error('❌ Comment operations failed:', error);
  }
}

// ============================================================================
// Example 7: Presence System
// ============================================================================

export async function examplePresenceSystem() {
  console.log('👥 Demonstrating Presence System...');

  try {
    // Update cursor position
    await collaboration.client.updateCursor({
      type: 'question',
      targetId: 'q1',
      coordinates: { x: 100, y: 200 },
      property: 'display.prompt',
      textPosition: 5
    });
    console.log('✅ Updated cursor position');

    // Update selection
    await collaboration.client.updateSelection({
      type: 'question',
      targetIds: ['q1'],
      bounds: { x: 50, y: 150, width: 300, height: 100 }
    });
    console.log('✅ Updated selection');

    // Update general presence
    await collaboration.client.updatePresence({
      userId: users[0].id,
      status: 'active',
      lastActivity: new Date(),
      activeElement: {
        type: 'question',
        targetId: 'q1',
        property: 'display.prompt'
      },
      viewport: {
        scrollX: 0,
        scrollY: 100,
        width: 1200,
        height: 800,
        zoom: 1
      }
    });
    console.log('✅ Updated presence');

  } catch (error) {
    console.error('❌ Presence updates failed:', error);
  }
}

// ============================================================================
// Example 8: Conflict Resolution
// ============================================================================

export function exampleConflictResolution() {
  console.log('⚔️ Demonstrating Conflict Resolution...');

  // Create conflicting operations
  const op1: Operation = {
    id: 'op1',
    type: 'delete',
    userId: users[0].id,
    timestamp: new Date(),
    path: ['questions'],
    position: 0,
    target: 'question'
  } as any;

  const op2: Operation = {
    id: 'op2',
    type: 'update',
    userId: users[1].id,
    timestamp: new Date(Date.now() + 50),
    path: ['questions', '0', 'display', 'prompt'],
    property: 'prompt',
    oldValue: 'What is your name?',
    newValue: 'What is your full name?'
  } as any;

  // Transform and detect conflicts
  const result = collaboration.ot.transform(op2, op1);
  
  console.log('🔄 Transformation result:');
  console.log('  - Transformed:', result.transformed);
  console.log('  - Conflicts:', result.conflicts?.length || 0);

  if (result.conflicts) {
    result.conflicts.forEach((conflict, index) => {
      console.log(`  Conflict ${index + 1}:`);
      console.log(`    - Type: ${conflict.type}`);
      console.log(`    - Description: ${conflict.description}`);
      console.log(`    - Resolution: ${conflict.resolution}`);
    });
  }

  // Create inverse operation for undo
  const inverse = collaboration.ot.createInverse(op1);
  console.log('↩️ Inverse operation:', inverse.type);
}

// ============================================================================
// Run All Examples
// ============================================================================

export async function runAllExamples() {
  console.log('🎯 Running Collaboration System Examples\n');
  
  try {
    await exampleBasicSetup();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleOperationalTransform();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleVersionControl();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleChangeTracking();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleRealtimeEvents();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await exampleCommentsSystem();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await examplePresenceSystem();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleConflictResolution();
    console.log('\n' + '='.repeat(50) + '\n');
    
    console.log('✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  } finally {
    // Cleanup
    collaboration.client.disconnect();
    console.log('🧹 Cleaned up resources');
  }
}

// ============================================================================
// Component Usage Examples
// ============================================================================

export const componentExamples = {
  // Example data for CommentThread component
  commentThread: {
    id: 'thread-123',
    questionnaireId: exampleQuestionnaire.id,
    position: {
      type: 'question' as const,
      targetId: 'q1',
      property: 'display.prompt'
    },
    comments: [
      {
        id: 'comment-1',
        questionnaireId: exampleQuestionnaire.id,
        sessionId: 'session-123',
        author: users[0],
        content: 'This question might be confusing for some users.',
        mentions: [],
        position: {
          type: 'question' as const,
          targetId: 'q1',
          property: 'display.prompt'
        },
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        isResolved: false
      },
      {
        id: 'comment-2',
        questionnaireId: exampleQuestionnaire.id,
        sessionId: 'session-123',
        author: users[1],
        content: 'Good point! Maybe we should add some clarification text.',
        mentions: [users[0].id],
        position: {
          type: 'question' as const,
          targetId: 'q1',
          property: 'display.prompt'
        },
        createdAt: new Date(Date.now() - 1800000), // 30 minutes ago
        isResolved: false
      }
    ],
    isResolved: false,
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 1800000),
    participants: [users[0].id, users[1].id]
  },

  // Example data for PresenceIndicator component
  presenceUsers: users.map(user => ({
    ...user,
    status: Math.random() > 0.5 ? 'online' as const : 'away' as const,
    lastSeen: new Date(Date.now() - Math.random() * 3600000) // Random time in last hour
  })),

  // Example data for VersionHistory component
  versions: [
    {
      id: 'version-1',
      questionnaireId: exampleQuestionnaire.id,
      version: 1,
      content: exampleQuestionnaire,
      operations: [],
      createdBy: users[0].id,
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
      message: 'Initial version',
      branchName: 'main'
    },
    {
      id: 'version-2',
      questionnaireId: exampleQuestionnaire.id,
      version: 2,
      content: exampleQuestionnaire,
      operations: [
        {
          id: 'op1',
          type: 'update',
          userId: users[0].id,
          timestamp: new Date(),
          path: ['questions', '0', 'display', 'prompt']
        } as any
      ],
      createdBy: users[0].id,
      createdAt: new Date(Date.now() - 43200000), // 12 hours ago
      message: 'Updated question prompt',
      branchName: 'main'
    }
  ],

  // Example data for ActivityTimeline component
  activities: [
    {
      id: 'activity-1',
      type: 'operation' as const,
      user: users[0],
      timestamp: new Date(Date.now() - 3600000),
      title: 'Updated question prompt',
      description: 'Changed prompt from "What is your name?" to "What is your full name?"',
      metadata: {
        operationType: 'update',
        target: 'question',
        changeId: 'change-123'
      },
      relatedItems: ['q1']
    },
    {
      id: 'activity-2',
      type: 'comment' as const,
      user: users[1],
      timestamp: new Date(Date.now() - 1800000),
      title: 'Added comment',
      description: 'This question might be confusing for some users.',
      metadata: {
        action: 'created',
        commentId: 'comment-1',
        targetId: 'q1'
      },
      relatedItems: ['q1']
    },
    {
      id: 'activity-3',
      type: 'join' as const,
      user: users[2],
      timestamp: new Date(Date.now() - 900000),
      title: 'Joined collaboration session',
      metadata: {
        action: 'joined',
        sessionId: 'session-123'
      }
    }
  ]
};

// Log component examples for easy copy-paste
if (typeof window !== 'undefined') {
  console.log('📋 Component Examples:', componentExamples);
}