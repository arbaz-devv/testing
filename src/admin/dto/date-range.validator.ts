import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsDateRangeValid(
  startDateProperty: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDateRangeValid',
      target: object.constructor,
      propertyName,
      constraints: [startDateProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [startPropertyName] = args.constraints as [string];
          if (!startPropertyName) return true;
          const startValue = (args.object as Record<string, unknown>)[
            startPropertyName
          ];

          if (!startValue || !value) return true;

          if (typeof startValue !== 'string' || typeof value !== 'string') {
            return true;
          }

          const startDate = new Date(startValue);
          const endDate = new Date(value);

          if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
          ) {
            return true;
          }

          return startDate.getTime() <= endDate.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          const [startPropertyName] = args.constraints as [string];
          return `${args.property} must be greater than or equal to ${startPropertyName}`;
        },
      },
    });
  };
}
