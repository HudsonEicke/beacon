import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'>;

// browsers block copying out of a password field, so showing the text is the only way to check or copy it
const PasswordInput = ({ className, ...props }: PasswordInputProps) =>
{
    const [isVisible, setIsVisible] = useState(false);
    const toggleLabel = isVisible ? 'Hide password' : 'Show password';

    return (
        <div className="relative">
            {/* Edge draws its own reveal button, which would sit next to ours */}
            <Input type={isVisible ? 'text' : 'password'} className={cn('pr-9 [&::-ms-reveal]:hidden', className)} {...props} />
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={toggleLabel}
                title={toggleLabel}
                onClick={() => setIsVisible(wasVisible => !wasVisible)}
                className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
            >
                {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
        </div>
    );
};

export default PasswordInput;
