#!/bin/bash
# Script to update import paths after refactoring

# Core
grep -rl "from '\$lib/database" src | xargs sed -i "s|from '\$lib/database|from '\$lib/core/database|g"
grep -rl "from '\$lib/renderer" src | xargs sed -i "s|from '\$lib/renderer|from '\$lib/core/renderer|g"
grep -rl "from '\$lib/scripting-engine" src | xargs sed -i "s|from '\$lib/scripting-engine|from '\$lib/core/scripting|g"

# Features
grep -rl "from '\$lib/components/designer" src | xargs sed -i "s|from '\$lib/components/designer|from '\$lib/features/designer/components|g"
grep -rl "from '\$lib/wysiwyg" src | xargs sed -i "s|from '\$lib/wysiwyg|from '\$lib/features/designer/components|g"
grep -rl "from '\$lib/stores/designerStore" src | xargs sed -i "s|from '\$lib/stores/designerStore|from '\$lib/features/designer/stores/designerStore|g"
grep -rl "from '\$lib/components/ReactionTestComponent" src | xargs sed -i "s|from '\$lib/components/ReactionTestComponent|from '\$lib/features/runtime/components/ReactionTestComponent|g"
grep -rl "from '\$lib/experiments" src | xargs sed -i "s|from '\$lib/experiments|from '\$lib/features/runtime/experiments|g"
grep -rl "from '\$lib/runtime" src | xargs sed -i "s|from '\$lib/runtime|from '\$lib/features/runtime/core|g"

# Shared
grep -rl "from '\$lib/components/common" src | xargs sed -i "s|from '\$lib/components/common|from '\$lib/shared/components/common|g"
grep -rl "from '\$lib/components/ui" src | xargs sed -i "s|from '\$lib/components/ui|from '\$lib/shared/components/ui|g"
grep -rl "from '\$lib/components/AppShell" src | xargs sed -i "s|from '\$lib/components/AppShell|from '\$lib/shared/components/AppShell|g"
grep -rl "from '\$lib/components/VariableDemo" src | xargs sed -i "s|from '\$lib/components/VariableDemo|from '\$lib/shared/components/VariableDemo|g"
grep -rl "from '\$lib/services" src | xargs sed -i "s|from '\$lib/services|from '\$lib/shared/services|g"
grep -rl "from '\$lib/stores/theme" src | xargs sed -i "s|from '\$lib/stores/theme|from '\$lib/shared/stores/theme|g"
grep -rl "from '\$lib/styles" src | xargs sed -i "s|from '\$lib/styles|from '\$lib/shared/styles|g"
grep -rl "from '\$lib/types" src | xargs sed -i "s|from '\$lib/types|from '\$lib/shared/types|g"
grep -rl "from '\$lib/utils" src | xargs sed -i "s|from '\$lib/utils|from '\$lib/shared/utils|g"
grep -rl "from '\$lib/shared" src | xargs sed -i "s|from '\$lib/shared|from '\$lib/shared/types|g"
