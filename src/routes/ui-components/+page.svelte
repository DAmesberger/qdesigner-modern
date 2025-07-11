<script lang="ts">
  import PageHeader from '$lib/components/ui/layout/PageHeader.svelte';
  import Container from '$lib/components/ui/layout/Container.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/ui/data/Badge.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
  import TextArea from '$lib/components/ui/forms/TextArea.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Modal from '$lib/components/ui/feedback/Modal.svelte';
  import Spinner from '$lib/components/ui/feedback/Spinner.svelte';
  
  let modalOpen = false;
  let checkboxChecked = false;
  let selectValue = '';
  
  const selectOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];
</script>

<PageHeader 
  title="UI Components" 
  description="A showcase of all UI components available in QDesigner"
/>

<Container>
  <div class="py-8 space-y-12">
    <!-- Buttons -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Buttons</h2>
      <Card>
        <div class="p-6 space-y-4">
          <div class="flex flex-wrap gap-3">
            <Button variant="primary" size="xs">Extra Small</Button>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
            <Button variant="primary" size="xl">Extra Large</Button>
          </div>
          
          <div class="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="primary" loading>Loading</Button>
          </div>
        </div>
      </Card>
    </section>
    
    <!-- Badges -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Badges</h2>
      <Card>
        <div class="p-6 space-y-4">
          <div class="flex flex-wrap gap-3">
            <Badge variant="gray">Gray</Badge>
            <Badge variant="red">Red</Badge>
            <Badge variant="yellow">Yellow</Badge>
            <Badge variant="green">Green</Badge>
            <Badge variant="blue">Blue</Badge>
            <Badge variant="indigo">Indigo</Badge>
            <Badge variant="purple">Purple</Badge>
            <Badge variant="pink">Pink</Badge>
          </div>
          
          <div class="flex flex-wrap gap-3">
            <Badge variant="green" dot>With Dot</Badge>
            <Badge variant="blue" size="sm">Small</Badge>
            <Badge variant="purple" size="md">Medium</Badge>
          </div>
        </div>
      </Card>
    </section>
    
    <!-- Form Components -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Form Components</h2>
      <Card>
        <div class="p-6 space-y-6">
          <FormGroup label="Text Input" hint="This is a hint text">
            <Input placeholder="Enter some text" />
          </FormGroup>
          
          <FormGroup label="Email Input" required>
            <Input type="email" placeholder="email@example.com" />
          </FormGroup>
          
          <FormGroup label="Password Input">
            <Input type="password" placeholder="Enter password" />
          </FormGroup>
          
          <FormGroup label="Select Input">
            <Select bind:value={selectValue} options={selectOptions} placeholder="Choose an option" />
          </FormGroup>
          
          <FormGroup label="Textarea">
            <TextArea placeholder="Enter multiple lines of text" rows={4} />
          </FormGroup>
          
          <Checkbox bind:checked={checkboxChecked} label="Checkbox Label" description="This is a description for the checkbox" />
          
          <FormGroup label="Error State" error="This field has an error">
            <Input error placeholder="This input has an error" />
          </FormGroup>
        </div>
      </Card>
    </section>
    
    <!-- Alerts -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Alerts</h2>
      <div class="space-y-4">
        <Alert variant="info" title="Info Alert">
          This is an informational message that provides helpful context.
        </Alert>
        
        <Alert variant="success" title="Success Alert">
          Your action was completed successfully!
        </Alert>
        
        <Alert variant="warning" title="Warning Alert">
          Please be aware of this important information.
        </Alert>
        
        <Alert variant="error" title="Error Alert" dismissible>
          Something went wrong. Please try again.
        </Alert>
      </div>
    </section>
    
    <!-- Spinners -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Spinners</h2>
      <Card>
        <div class="p-6">
          <div class="flex items-center gap-6">
            <div class="text-center">
              <Spinner size="sm" />
              <p class="mt-2 text-sm text-gray-500">Small</p>
            </div>
            <div class="text-center">
              <Spinner size="md" />
              <p class="mt-2 text-sm text-gray-500">Medium</p>
            </div>
            <div class="text-center">
              <Spinner size="lg" />
              <p class="mt-2 text-sm text-gray-500">Large</p>
            </div>
            <div class="text-center bg-gray-800 p-4 rounded">
              <Spinner color="white" />
              <p class="mt-2 text-sm text-gray-300">White</p>
            </div>
          </div>
        </div>
      </Card>
    </section>
    
    <!-- Modal -->
    <section>
      <h2 class="text-2xl font-bold mb-4">Modal</h2>
      <Card>
        <div class="p-6">
          <Button on:click={() => modalOpen = true}>Open Modal</Button>
          
          <Modal bind:open={modalOpen} title="Example Modal" size="md">
            <p class="text-gray-600">
              This is an example modal dialog. You can put any content here.
            </p>
            <div slot="footer" class="flex gap-3">
              <Button variant="secondary" on:click={() => modalOpen = false}>Cancel</Button>
              <Button variant="primary" on:click={() => modalOpen = false}>Confirm</Button>
            </div>
          </Modal>
        </div>
      </Card>
    </section>
  </div>
</Container>