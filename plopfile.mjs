import { fileURLToPath } from 'url'
import path from 'path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default function (plop) {
  plop.setGenerator('entity', {
    description: 'Create new domain entity',
    prompts: [
      { type: 'input', name: 'name', message: 'Entity name:' },
      {
        type: 'confirm',
        name: 'withDTO',
        message: 'Generate a DTO for this entity?',
        default: false,
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'src/domain/entities/{{pascalCase name}}.ts',
        templateFile: 'src/templates/entity.hbs',
      },
      {
        type: 'add',
        path: 'src/domain/entities/__tests__/{{pascalCase name}}.test.ts',
        templateFile: 'src/templates/entity.test.hbs',
      },
      {
        type: 'add',
        path: 'src/infrastructure/mappers/{{pascalCase name}}Mapper.ts',
        templateFile: 'src/templates/mapper.hbs',
      },
      {
        type: 'add',
        path: 'src/infrastructure/mappers/__tests__/{{pascalCase name}}Mapper.test.ts',
        templateFile: 'src/templates/mapper.test.hbs',
      },
      function customDTOAction(answers) {
        if (!answers.withDTO) return [];
        return {
          type: 'add',
          path: 'src/domain/dtos/{{pascalCase name}}DTO.ts',
          templateFile: 'src/templates/dto.hbs',
        };
      },
    ],
  })



  plop.setGenerator('usecase', {
    description: 'Create new use case',
    prompts: [{ type: 'input', name: 'name', message: 'Use case name:' }],
    actions: [
      {
        type: 'add',
        path: 'src/application/usecases/{{pascalCase name}}UseCase.ts',
        templateFile: 'src/templates/usecase.hbs',
      },
    ],
  })

    plop.setGenerator('port', {
      description: 'Create new port',
      prompts: [{ type: 'input', name: 'name', message: 'Port name:' }],
      actions: [
        {
          type: 'add',
          path: 'src/domain/ports/{{pascalCase name}}Port.ts',
          templateFile: 'src/templates/port.hbs',
        },
      ],
    })

    plop.setGenerator('service', {
      description: 'Create new infrastructure service',
      prompts: [{ type: 'input', name: 'name', message: 'Service name:' }],
      actions: [
        {
          type: 'add',
          path: 'src/infrastructure/services/{{pascalCase name}}ServiceImpl.ts',
          templateFile: 'src/templates/service.hbs',
        },
      ],
    })

  plop.setGenerator('adapter', {
    description: 'Create new adapter and matching port',
    prompts: [
      { type: 'input', name: 'name', message: 'Adapter name:' },
      {
        type: 'input',
        name: 'methods',
        message: 'Method signatures (comma-separated, e.g. "saveUser(user: User): Promise<void>, findUser(id: string): Promise<User>"):',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'src/infrastructure/adapters/{{pascalCase name}}Impl.ts',
        templateFile: 'src/templates/adapter.hbs',
      },
      {
        type: 'add',
        path: 'src/infrastructure/adapters/__tests__/{{pascalCase name}}Impl.test.ts',
        templateFile: 'src/templates/adapter.test.hbs',
      },
      {
        type: 'add',
        path: 'src/domain/ports/{{pascalCase name}}Port.ts',
        templateFile: 'src/templates/port_from_adapter.hbs',
        data: (answers) => {
          // Parse methods into array of {name, params, returnType}
          const methods = answers.methods.split(',').map(m => {
            const match = m.trim().match(/^([\w$]+)\(([^)]*)\):\s*(.+)$/);
            if (!match) return null;
            return { name: match[1], params: match[2], returnType: match[3] };
          }).filter(Boolean);
          return { methods };
        },
      },
    ],
  })



  plop.setGenerator('store', {
    description: 'Create new Zustand store',
    prompts: [{ type: 'input', name: 'name', message: 'Store name:' }],
    actions: [
      {
        type: 'add',
        path: 'src/ui/stores/{{camelCase name}}Store.ts',
        templateFile: 'src/templates/store.hbs',
      },
    ],
  })

  plop.setGenerator('component', {
    description: 'Create new UI component',
    prompts: [{ type: 'input', name: 'name', message: 'Component name:' }],
    actions: [
      {
        type: 'add',
        path: 'src/ui/components/{{pascalCase name}}.tsx',
        templateFile: 'src/templates/component.hbs',
      },
    ],
  })
}
