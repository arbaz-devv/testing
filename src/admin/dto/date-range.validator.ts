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
          const [startPropertyName] = args.constraints;
          const startValue = (args.object as Record<string, unknown>)[
            startPropertyName
          ];

          if (!startValue || !value) return true;

          const startDate = new Date(String(startValue));
          const endDate = new Date(String(value));

          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return true;
          }

          return startDate.getTime() <= endDate.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          const [startPropertyName] = args.constraints;
          return `${args.property} must be greater than or equal to ${startPropertyName}`;
        },
      },
    });
  };
}
